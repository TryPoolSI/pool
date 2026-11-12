import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

// Called only with the status of the fresh project owned by auth-browser.mjs.
// Privileged fixture setup never supplies the identity used by assertions.
function clients(status) {
  assert.equal(status.API_URL, "http://127.0.0.1:55321");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const userClient = () => createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, options);
  const fixture = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  async function user(label, confirmed = true) {
    const email = `r3-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Pool-${crypto.randomUUID()}!`;
    const created = await fixture.auth.admin.createUser({ email, password, email_confirm: confirmed });
    assert.ifError(created.error);
    const client = userClient();
    if (confirmed) assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
    return { client, id: created.data.user.id, email, password };
  }
  return { user, userClient };
}

async function ok(client, name, args) {
  const result = await client.rpc(name, args);
  assert.ifError(result.error);
  return result.data;
}

function createFamilyArgs(name) {
  return { p_name: name, p_display_name: "Fixture adult" };
}

export async function oneFamilyUpgrade(status, migration) {
  const url = new URL(status.DB_URL);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55322");
  const { user } = clients(status);
  const [first, second, guardian] = await Promise.all(
    ["upgrade-first-owner", "upgrade-second-owner", "upgrade-guardian"].map((label) => user(label)),
  );
  const firstFamily = await ok(first.client, "create_family", createFamilyArgs("First legacy family"));
  const secondFamily = await ok(second.client, "create_family", createFamilyArgs("Second legacy family"));
  for (const [owner, family] of [[first, firstFamily], [second, secondFamily]]) {
    const [{ token }] = await ok(owner.client, "create_invitation", {
      p_kind: "guardian", p_scope_id: family, p_email: guardian.email,
    });
    await ok(guardian.client, "accept_invitation", {
      p_kind: "guardian", p_token: token, p_display_name: "Legacy guardian",
    });
  }

  const db = new Client({ connectionString: url.href });
  const membershipRows = async (connection) => (await connection.query(
    "select family_id, role, joined_at, removed_at from public.family_members where user_id = $1 order by family_id",
    [guardian.id],
  )).rows;
  await db.connect();
  let reconciled;
  try {
    const before = await membershipRows(db);
    assert.equal(before.length, 2);
    assert.ok(before.every((row) => row.removed_at === null));
    await db.query("begin");
    try {
      await assert.rejects(db.query(migration), { code: "23505" });
    } finally {
      await db.query("rollback");
    }
    assert.deepEqual(await membershipRows(db), before);
    assert.equal((await db.query("select to_regclass('public.family_members_one_active_per_user') as name")).rows[0].name, null);

    await ok(second.client, "remove_family_member", { p_family_id: secondFamily, p_user_id: guardian.id });
    reconciled = await membershipRows(db);
    assert.equal(reconciled.length, 2);
    assert.ok(reconciled.find((row) => row.family_id === secondFamily).removed_at);
  } finally {
    await db.end();
  }

  return async () => {
    const verify = new Client({ connectionString: url.href });
    await verify.connect();
    try {
      assert.deepEqual(await membershipRows(verify), reconciled, "Upgrade must preserve active and removed rows");
    } finally {
      await verify.end();
    }
  };
}

export async function baselineIdentity(status) {
  const person = await clients(status).user("r2-upgrade");
  return async () => {
    const result = await person.client.auth.signInWithPassword({ email: person.email, password: person.password });
    assert.ifError(result.error);
    assert.equal(result.data.user.id, person.id, "R2 identity must survive migration");
    const family = await person.client.rpc("create_family", { p_name: "Upgraded R2 family", p_display_name: "Existing adult" });
    assert.ifError(family.error);
    const persisted = await person.client.from("families").select("id").eq("id", family.data).single();
    assert.ifError(persisted.error);
    assert.equal(persisted.data.id, family.data);
  };
}
export async function permissionTests(status, sql) {
  const { user, userClient } = clients(status);
  const [owner, other, guardian, outsider, newcomer] = await Promise.all(["owner", "other", "guardian", "outsider", "new"].map((label) => user(label)));
  async function denied(client, name, args, code, reason) {
    const result = await client.rpc(name, args);
    assert.ok(result.error, `${name} must be denied`);
    if (code) assert.equal(result.error.code, code);
    if (reason) assert.equal(result.error.message, reason);
  }
  const family = await ok(owner.client, "create_family", { p_name: "Oak family", p_display_name: "Oak owner" });
  const otherFamily = await ok(other.client, "create_family", { p_name: "Elm family", p_display_name: "Elm owner" });
  const circle = await ok(owner.client, "create_circle", { p_family_id: family, p_name: "School circle" });
  const tables = ["profiles", "families", "family_members", "circles", "circle_families", "invitations"];
  const anon = userClient();
  for (const table of tables) {
    assert.ok((await anon.from(table).select("*")).error, `anon ${table}`);
    const result = await outsider.client.from(table).select("*");
    if (table === "invitations") assert.ok(result.error);
    else { assert.ifError(result.error); assert.deepEqual(result.data, []); }
    const timestamp = ["family_members", "circle_families"].includes(table) ? "joined_at" : "created_at";
    for (const client of [anon, owner.client, outsider.client]) {
      assert.equal((await client.from(table).insert({})).error?.code, "42501", `direct insert ${table}`);
      assert.equal((await client.from(table).update({ [timestamp]: new Date().toISOString() }).not(timestamp, "is", null)).error?.code, "42501", `direct update ${table}`);
      assert.equal((await client.from(table).delete().not(timestamp, "is", null)).error?.code, "42501", `direct delete ${table}`);
    }
  }
  // Test actual privilege-escalation payloads, including the table's real columns.
  assert.ok((await guardian.client.from("family_members").insert({ family_id: family, user_id: guardian.id, role: "owner" })).error);
  assert.ok((await owner.client.from("family_members").update({ role: "owner" }).eq("user_id", guardian.id)).error);
  assert.ok((await owner.client.from("circles").update({ coordinator_id: other.id }).eq("id", circle)).error);
  assert.ok((await owner.client.from("invitations").select("token_digest")).error);
  await denied(outsider.client, "create_circle", { p_family_id: family, p_name: "Spoof" }, "PT404");
  await denied(outsider.client, "circle_roster", { p_circle_id: circle }, "PT404");
  await denied(outsider.client, "list_invitations", { p_kind: "guardian", p_scope_id: family }, "PT404");
  for (const kind of ["guardian", "circle"]) {
    await denied(outsider.client, "create_invitation", { p_kind: kind, p_scope_id: kind === "circle" ? circle : family, p_email: outsider.email }, "PT404");
  }
  await denied(owner.client, "create_invitation", { p_kind: "owner", p_scope_id: family, p_email: other.email }, "PT400");
  await denied(owner.client, "create_family", { p_name: "Spoof", p_display_name: "Spoof", p_owner_id: outsider.id });
  const invite = async (kind, email) => (await ok(owner.client, "create_invitation", { p_kind: kind, p_scope_id: kind === "circle" ? circle : family, p_email: email }))[0];
  const acceptArgs = (inv, kind = "guardian", extra = {}) => ({ p_kind: kind, p_token: inv.token, p_display_name: "Invited adult", ...extra });
  const unconsumed = (invitation) => {
    assert.equal(sql(`select consumed_at is null and consumed_by is null and accepted_family_id is null and revoked_at is null
      from public.invitations where id = '${invitation.invitation_id}';`), "t");
  };
  async function raceMembershipRequests(person, attempts) {
    const results = await Promise.all(attempts.map(({ command, args }) => person.client.rpc(command, args)));
    assert.equal(results.filter(({ error }) => !error).length, 1);
    assert.equal(sql(`select count(*) from public.family_members where user_id = '${person.id}' and removed_at is null;`), "1");
    for (const [index, { familyName, invitation }] of attempts.entries()) {
      const { error } = results[index];
      if (error) {
        assert.equal(error.code, "PT409");
        assert.equal(error.message, "active_family_exists");
        if (invitation) unconsumed(invitation);
      }
      if (familyName)
        assert.equal(sql(`select count(*) from public.families where name = '${familyName}';`), error ? "0" : "1");
    }
  }
  const createAttempt = (familyName) => ({
    command: "create_family", args: createFamilyArgs(familyName), familyName,
  });
  const guardianInvite = await invite("guardian", guardian.email.toUpperCase());
  assert.match(guardianInvite.token, /^[a-f0-9]{64}$/);
  assert.equal(sql(`select token_digest = extensions.digest('${guardianInvite.token}', 'sha256') from public.invitations where id = '${guardianInvite.invitation_id}';`), "t");
  await denied(outsider.client, "accept_invitation", acceptArgs(guardianInvite), "PT404");
  await denied(outsider.client, "invitation_preview", { p_kind: "guardian", p_token: guardianInvite.token }, "PT404");
  await denied(guardian.client, "accept_invitation", acceptArgs(guardianInvite, "circle", { p_family_id: otherFamily }), "PT404");
  await denied(guardian.client, "accept_invitation", acceptArgs(guardianInvite, "guardian", { p_family_id: otherFamily }), "PT400");
  const preview = await ok(guardian.client, "invitation_preview", { p_kind: "guardian", p_token: guardianInvite.token });
  assert.equal(preview[0].scope_name, "Oak family");
  assert.equal(sql(`select consumed_at is null from public.invitations where id = '${guardianInvite.invitation_id}';`), "t");
  const results = await Promise.all([guardian.client.rpc("accept_invitation", acceptArgs(guardianInvite)), guardian.client.rpc("accept_invitation", acceptArgs(guardianInvite))]);
  assert.equal(results.filter((r) => !r.error).length, 1);
  assert.equal(results.find((r) => r.error).error.code, "PT410");
  const memberships = await guardian.client.from("family_members").select("*").eq("user_id", guardian.id);
  assert.ifError(memberships.error);
  assert.equal(memberships.data.length, 1);
  assert.equal(memberships.data[0].role, "guardian");
  await denied(guardian.client, "create_invitation", { p_kind: "guardian", p_scope_id: family, p_email: outsider.email }, "PT404");
  await denied(guardian.client, "remove_family_member", { p_family_id: family, p_user_id: owner.id }, "PT404");
  await denied(guardian.client, "list_invitations", { p_kind: "guardian", p_scope_id: family }, "PT404");
  const safeProfiles = await guardian.client.from("profiles").select("*");
  assert.ifError(safeProfiles.error);
  assert.equal(safeProfiles.data.length, 2);
  assert.deepEqual(Object.keys(safeProfiles.data[0]).sort(), ["created_at", "display_name", "id"]);
  const circleInvite = await invite("circle", other.email);
  await denied(other.client, "accept_invitation", acceptArgs(circleInvite, "circle", { p_family_id: family }), "PT404");
  await denied(owner.client, "accept_invitation", acceptArgs(circleInvite, "circle", { p_new_family_name: "Wrong recipient family" }), "PT404");
  await denied(other.client, "accept_invitation", acceptArgs(circleInvite, "circle", { p_new_family_name: "Rejected circle family" }), "PT409", "active_family_exists");
  unconsumed(circleInvite);
  assert.equal(sql("select count(*) from public.families where name in ('Wrong recipient family', 'Rejected circle family');"), "0");
  const guardianCircle = await invite("circle", guardian.email);
  await denied(guardian.client, "accept_invitation", acceptArgs(guardianCircle, "circle", { p_family_id: family }), "PT404");
  await ok(other.client, "accept_invitation", acceptArgs(circleInvite, "circle", { p_family_id: otherFamily }));
  assert.equal((await ok(other.client, "circle_roster", { p_circle_id: circle })).length, 2);
  assert.deepEqual((await other.client.from("families").select("id")).data, [{ id: otherFamily }]);
  assert.deepEqual((await other.client.from("profiles").select("id")).data, [{ id: other.id }]);
  await denied(other.client, "create_invitation", { p_kind: "circle", p_scope_id: circle, p_email: outsider.email }, "PT404");
  await denied(other.client, "remove_circle_family", { p_circle_id: circle, p_family_id: family }, "PT404");
  const newInvite = await invite("circle", newcomer.email);
  const newArgs = acceptArgs(newInvite, "circle", { p_new_family_name: "New family" });
  const newResults = await Promise.all([newcomer.client.rpc("accept_invitation", newArgs), newcomer.client.rpc("accept_invitation", newArgs)]);
  assert.equal(newResults.filter((r) => !r.error).length, 1);
  assert.equal(newResults.find((r) => r.error).error.code, "PT410");
  assert.equal(sql("select count(*) from public.families where name = 'New family';"), "1");
  assert.equal((await newcomer.client.from("families").select("id")).data.length, 1, "Losing transaction rolls back bootstrap");
  for (const state of ["expired", "revoked"]) {
    const inv = await invite("guardian", outsider.email);
    if (state === "expired") sql(`update public.invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = '${inv.invitation_id}';`);
    else {
      await denied(other.client, "revoke_invitation", { p_id: inv.invitation_id }, "PT404");
      await ok(owner.client, "revoke_invitation", { p_id: inv.invitation_id });
    }
    await denied(outsider.client, "accept_invitation", acceptArgs(inv), "PT410");
    assert.deepEqual((await outsider.client.from("family_members").select("*")).data, []);
  }
  const ordinary = await ok(owner.client, "list_invitations", { p_kind: "guardian", p_scope_id: family });
  assert.ok(ordinary.every((r) => !Object.hasOwn(r, "token") && !Object.hasOwn(r, "token_digest")));
  const [firstOwner, secondOwner] = await Promise.all([user("first-owner-race"), user("second-owner-race")]);
  const multiOwnerFamily = await ok(firstOwner.client, "create_family", createFamilyArgs("Owner race fixture"));
  // Fixture-only second owner exercises future-safe last-owner locking; there is
  // deliberately no user command to insert/promote an owner.
  sql(`insert into public.profiles(id,display_name) values('${secondOwner.id}','Second owner');
    insert into public.family_members(family_id,user_id,role) values('${multiOwnerFamily}','${secondOwner.id}','owner');`);
  const ownerRace = await Promise.all([
    firstOwner.client.rpc("remove_family_member", { p_family_id: multiOwnerFamily, p_user_id: firstOwner.id }),
    secondOwner.client.rpc("remove_family_member", { p_family_id: multiOwnerFamily, p_user_id: secondOwner.id }),
  ]);
  assert.equal(ownerRace.filter((r) => !r.error).length, 1);
  assert.equal(ownerRace.find((r) => r.error).error.code, "PT409");
  assert.equal(sql(`select count(*) from public.family_members where family_id = '${multiOwnerFamily}' and role = 'owner' and removed_at is null;`), "1");
  const raceUser = await user("revoke-race");
  const raceInvite = await invite("guardian", raceUser.email);
  const race = await Promise.all([
    raceUser.client.rpc("accept_invitation", acceptArgs(raceInvite)),
    owner.client.rpc("revoke_invitation", { p_id: raceInvite.invitation_id }),
  ]);
  assert.ifError(race[1].error);
  const raceMembership = await raceUser.client.from("family_members").select("user_id").eq("family_id", family).eq("user_id", raceUser.id);
  assert.ifError(raceMembership.error);
  assert.equal(raceMembership.data.length, race[0].error ? 0 : 1);
  if (race[0].error) assert.equal(race[0].error.code, "PT410");
  // Anonymous direct RPCs for every public command and inaccessible private helpers.
  const commands = {
    create_family: { p_name: "Anon", p_display_name: "Anon" }, create_circle: { p_family_id: family, p_name: "Anon" },
    create_invitation: { p_kind: "guardian", p_scope_id: family, p_email: outsider.email },
    invitation_preview: { p_kind: "guardian", p_token: guardianInvite.token }, accept_invitation: acceptArgs(guardianInvite),
    revoke_invitation: { p_id: guardianInvite.invitation_id }, list_invitations: { p_kind: "guardian", p_scope_id: family },
    remove_family_member: { p_family_id: family, p_user_id: guardian.id }, remove_circle_family: { p_circle_id: circle, p_family_id: otherFamily }, circle_roster: { p_circle_id: circle },
  };
  for (const [command, args] of Object.entries(commands)) await denied(anon, command, args);
  await denied(outsider.client, "lock_scope", { p_kind: "guardian", p_scope_id: family });
  assert.ok((await outsider.client.schema("pool_private").rpc("create_family", { p_name: "Bad", p_display_name: "Bad" })).error);
  const unconfirmed = await user("unconfirmed", false);
  // Real Auth refuses a password session before confirmation.
  assert.ok((await unconfirmed.client.auth.signInWithPassword({ email: unconfirmed.email, password: unconfirmed.password })).error);
  // A still-live session loses command authority immediately when verification is removed.
  sql(`update auth.users set email_confirmed_at = null where id = '${outsider.id}';`);
  await denied(outsider.client, "create_family", { p_name: "Bad", p_display_name: "Bad" }, "PT401");
  await denied(owner.client, "remove_family_member", { p_family_id: family, p_user_id: owner.id }, "PT409");
  await denied(owner.client, "remove_circle_family", { p_circle_id: circle, p_family_id: family }, "PT409");
  const staleGuardianInvite = await invite("guardian", guardian.email);
  await ok(owner.client, "remove_family_member", { p_family_id: family, p_user_id: guardian.id });
  await denied(guardian.client, "accept_invitation", acceptArgs(staleGuardianInvite), "PT410");
  for (const table of ["family_members", "families", "circles", "circle_families"]) {
    assert.deepEqual((await guardian.client.from(table).select("*")).data, [], `Removed guardian loses ${table}`);
  }
  await denied(guardian.client, "circle_roster", { p_circle_id: circle }, "PT404");
  const [{ token: otherGuardianToken }] = await ok(other.client, "create_invitation", {
    p_kind: "guardian", p_scope_id: otherFamily, p_email: guardian.email,
  });
  await ok(guardian.client, "accept_invitation", acceptArgs({ token: otherGuardianToken }));
  const reactivation = await invite("guardian", guardian.email);
  const removedAt = () => sql(`select removed_at from public.family_members where family_id = '${family}' and user_id = '${guardian.id}';`);
  const removedTimestamp = removedAt();
  await denied(guardian.client, "accept_invitation", acceptArgs(reactivation), "PT409", "active_family_exists");
  assert.ok(removedTimestamp);
  assert.equal(removedAt(), removedTimestamp);
  unconsumed(reactivation);
  await ok(guardian.client, "remove_family_member", { p_family_id: otherFamily, p_user_id: guardian.id });
  await ok(guardian.client, "accept_invitation", acceptArgs(reactivation));
  assert.equal(sql(`select count(*) from public.family_members where user_id = '${guardian.id}' and removed_at is null;`), "1");
  assert.equal(removedAt(), "");
  await ok(owner.client, "remove_circle_family", { p_circle_id: circle, p_family_id: otherFamily });
  assert.deepEqual((await other.client.from("circles").select("*")).data, []);
  await denied(other.client, "circle_roster", { p_circle_id: circle }, "PT404");
  await denied(other.client, "accept_invitation", acceptArgs(circleInvite, "circle", { p_family_id: otherFamily }), "PT410");
  assert.equal(sql("select string_agg(tablename,',' order by tablename) from pg_tables where schemaname = 'public' and tablename ~ 'replacement';"), "replacement_events");
  const directRacer = await user("direct-race");
  await raceMembershipRequests(directRacer, [createAttempt("Direct race A"), createAttempt("Direct race B")]);
  const guardianAttempt = async (person) => {
    const invitation = await invite("guardian", person.email);
    return { command: "accept_invitation", args: acceptArgs(invitation), invitation };
  };
  const mixedRacer = await user("direct-guardian-race");
  await raceMembershipRequests(mixedRacer, [createAttempt("Mixed race family"), await guardianAttempt(mixedRacer)]);
  const invitationRacer = await user("guardian-circle-race");
  const competingCircleInvite = await invite("circle", invitationRacer.email);
  await raceMembershipRequests(invitationRacer, [
    await guardianAttempt(invitationRacer),
    {
      command: "accept_invitation",
      args: acceptArgs(competingCircleInvite, "circle", { p_new_family_name: "Circle race family" }),
      familyName: "Circle race family",
      invitation: competingCircleInvite,
    },
  ]);
  console.log("Permission assertions passed: public-key sessions, Data API/RPC denials, scopes, races, expiry, revocation, removal and last owner.");
}
