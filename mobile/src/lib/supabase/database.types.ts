
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "children": {
                  Row: {
                    "created_at": string,"display_name": string,"family_id": string,"id": string,"revision": number,"seat_requirement": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"family_id": string,"id": string,"revision"?: number,"seat_requirement": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"family_id"?: string,"id"?: string,"revision"?: number,"seat_requirement"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "children_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"circle_families": {
                  Row: {
                    "circle_id": string,"family_id": string,"joined_at": string,"removed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "circle_id": string,"family_id": string,"joined_at"?: string,"removed_at"?: string | null
                  }
                  Update: {
                    "circle_id"?: string,"family_id"?: string,"joined_at"?: string,"removed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "circle_families_circle_id_fkey"
      columns: ["circle_id"]
isOneToOne: false
      referencedRelation: "circles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "circle_families_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"circles": {
                  Row: {
                    "coordinator_family_id": string,"coordinator_id": string,"created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coordinator_family_id": string,"coordinator_id": string,"created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "coordinator_family_id"?: string,"coordinator_id"?: string,"created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "circles_coordinator_family_id_coordinator_id_fkey"
      columns: ["coordinator_family_id","coordinator_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    }
                  ]
                },"driver_assignments": {
                  Row: {
                    "confirmed_at": string,"driver_id": string,"ends_at": string,"id": string,"proposal_id": string,"release_reason": string | null,"released_at": string | null,"ride_id": string,"ride_revision": number,"starts_at": string,"vehicle_id": string,"vehicle_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmed_at"?: string,"driver_id": string,"ends_at": string,"id"?: string,"proposal_id": string,"release_reason"?: string | null,"released_at"?: string | null,"ride_id": string,"ride_revision": number,"starts_at": string,"vehicle_id": string,"vehicle_version": number
                  }
                  Update: {
                    "confirmed_at"?: string,"driver_id"?: string,"ends_at"?: string,"id"?: string,"proposal_id"?: string,"release_reason"?: string | null,"released_at"?: string | null,"ride_id"?: string,"ride_revision"?: number,"starts_at"?: string,"vehicle_id"?: string,"vehicle_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_assignments_proposal_id_ride_id_ride_revision_drive_fkey"
      columns: ["proposal_id","ride_id","ride_revision","driver_id","vehicle_id","vehicle_version"]
isOneToOne: false
      referencedRelation: "driver_proposals"
      referencedColumns: ["id","ride_id","ride_revision","driver_id","vehicle_id","vehicle_version"]
    }
                  ]
                },"driver_proposals": {
                  Row: {
                    "accepted_at": string | null,"available_seats": number | null,"closed_at": string | null,"created_at": string,"deadline": string,"driver_family_id": string,"driver_id": string,"id": string,"mode": string,"nominated_by": string,"nominating_family_id": string,"original_assignment_id": string | null,"original_assignment_revision": number | null,"request_order": number,"restraints_confirmed": boolean,"ride_id": string,"ride_revision": number,"roster": NonNullable<Json>,"status": string,"vehicle_id": string,"vehicle_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"available_seats"?: number | null,"closed_at"?: string | null,"created_at"?: string,"deadline": string,"driver_family_id": string,"driver_id": string,"id": string,"mode"?: string,"nominated_by": string,"nominating_family_id": string,"original_assignment_id"?: string | null,"original_assignment_revision"?: number | null,"request_order"?: never,"restraints_confirmed"?: boolean,"ride_id": string,"ride_revision": number,"roster": NonNullable<Json>,"status"?: string,"vehicle_id": string,"vehicle_version": number
                  }
                  Update: {
                    "accepted_at"?: string | null,"available_seats"?: number | null,"closed_at"?: string | null,"created_at"?: string,"deadline"?: string,"driver_family_id"?: string,"driver_id"?: string,"id"?: string,"mode"?: string,"nominated_by"?: string,"nominating_family_id"?: string,"original_assignment_id"?: string | null,"original_assignment_revision"?: number | null,"request_order"?: never,"restraints_confirmed"?: boolean,"ride_id"?: string,"ride_revision"?: number,"roster"?: NonNullable<Json>,"status"?: string,"vehicle_id"?: string,"vehicle_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "driver_proposals_driver_family_id_driver_id_fkey"
      columns: ["driver_family_id","driver_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    },{
      foreignKeyName: "driver_proposals_nominated_by_fkey"
      columns: ["nominated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_proposals_nominating_family_id_fkey"
      columns: ["nominating_family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_proposals_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: false
      referencedRelation: "rides"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "driver_proposals_vehicle_id_driver_id_fkey"
      columns: ["vehicle_id","driver_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id","driver_id"]
    },{
      foreignKeyName: "replacement_origin"
      columns: ["original_assignment_id","ride_id","original_assignment_revision"]
isOneToOne: false
      referencedRelation: "driver_assignments"
      referencedColumns: ["id","ride_id","ride_revision"]
    }
                  ]
                },"families": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [

                  ]
                },"family_members": {
                  Row: {
                    "family_id": string,"joined_at": string,"removed_at": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "family_id": string,"joined_at"?: string,"removed_at"?: string | null,"role": string,"user_id": string
                  }
                  Update: {
                    "family_id"?: string,"joined_at"?: string,"removed_at"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "family_members_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_family_id": string | null,"circle_id": string | null,"consumed_at": string | null,"consumed_by": string | null,"created_at": string,"created_by": string,"email": string,"expires_at": string,"family_id": string | null,"id": string,"kind": string,"revoked_at": string | null,"token_digest": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_family_id"?: string | null,"circle_id"?: string | null,"consumed_at"?: string | null,"consumed_by"?: string | null,"created_at"?: string,"created_by": string,"email": string,"expires_at"?: string,"family_id"?: string | null,"id"?: string,"kind": string,"revoked_at"?: string | null,"token_digest": string
                  }
                  Update: {
                    "accepted_family_id"?: string | null,"circle_id"?: string | null,"consumed_at"?: string | null,"consumed_by"?: string | null,"created_at"?: string,"created_by"?: string,"email"?: string,"expires_at"?: string,"family_id"?: string | null,"id"?: string,"kind"?: string,"revoked_at"?: string | null,"token_digest"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_family_id_fkey"
      columns: ["accepted_family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_circle_id_fkey"
      columns: ["circle_id"]
isOneToOne: false
      referencedRelation: "circles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_consumed_by_fkey"
      columns: ["consumed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [

                  ]
                },"replacement_events": {
                  Row: {
                    "actor_id": string,"actor_name": string,"id": number,"kind": string,"occurred_at": string,"proposal_id": string,"ride_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_name": string,"id"?: never,"kind": string,"occurred_at"?: string,"proposal_id": string,"ride_id": string
                  }
                  Update: {
                    "actor_id"?: string,"actor_name"?: string,"id"?: never,"kind"?: string,"occurred_at"?: string,"proposal_id"?: string,"ride_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "replacement_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replacement_events_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "driver_proposals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replacement_events_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: false
      referencedRelation: "rides"
      referencedColumns: ["id"]
    }
                  ]
                },"ride_driver_consents": {
                  Row: {
                    "child_id": string,"consented_at": string,"driver_id": string,"family_id": string,"guardian_id": string,"proposal_id": string,"revoked_at": string | null,"ride_id": string,"ride_revision": number,"vehicle_id": string,"vehicle_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"consented_at"?: string,"driver_id": string,"family_id": string,"guardian_id": string,"proposal_id": string,"revoked_at"?: string | null,"ride_id": string,"ride_revision": number,"vehicle_id": string,"vehicle_version": number
                  }
                  Update: {
                    "child_id"?: string,"consented_at"?: string,"driver_id"?: string,"family_id"?: string,"guardian_id"?: string,"proposal_id"?: string,"revoked_at"?: string | null,"ride_id"?: string,"ride_revision"?: number,"vehicle_id"?: string,"vehicle_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_driver_consents_child_id_family_id_fkey"
      columns: ["child_id","family_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id","family_id"]
    },{
      foreignKeyName: "ride_driver_consents_family_id_guardian_id_fkey"
      columns: ["family_id","guardian_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    },{
      foreignKeyName: "ride_driver_consents_proposal_id_ride_id_ride_revision_dri_fkey"
      columns: ["proposal_id","ride_id","ride_revision","driver_id","vehicle_id","vehicle_version"]
isOneToOne: false
      referencedRelation: "driver_proposals"
      referencedColumns: ["id","ride_id","ride_revision","driver_id","vehicle_id","vehicle_version"]
    }
                  ]
                },"ride_event_requests": {
                  Row: {
                    "acknowledged_at": string,"actor_id": string,"child_id": string,"event_id": string,"kind": string,"previous_version": number,"request_id": string,"ride_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acknowledged_at"?: string,"actor_id": string,"child_id": string,"event_id": string,"kind": string,"previous_version": number,"request_id": string,"ride_id": string
                  }
                  Update: {
                    "acknowledged_at"?: string,"actor_id"?: string,"child_id"?: string,"event_id"?: string,"kind"?: string,"previous_version"?: number,"request_id"?: string,"ride_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_event_requests_event_id_ride_id_child_id_kind_previou_fkey"
      columns: ["event_id","ride_id","child_id","kind","previous_version","actor_id"]
isOneToOne: false
      referencedRelation: "ride_events"
      referencedColumns: ["request_id","ride_id","child_id","kind","previous_version","actor_id"]
    }
                  ]
                },"ride_events": {
                  Row: {
                    "actor_id": string,"actor_name": string,"child_id": string,"kind": string,"occurred_at": string,"previous_version": number,"request_id": string,"ride_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_name": string,"child_id": string,"kind": string,"occurred_at"?: string,"previous_version": number,"request_id": string,"ride_id": string
                  }
                  Update: {
                    "actor_id"?: string,"actor_name"?: string,"child_id"?: string,"kind"?: string,"occurred_at"?: string,"previous_version"?: number,"request_id"?: string,"ride_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ride_events_ride_id_child_id_fkey"
      columns: ["ride_id","child_id"]
isOneToOne: false
      referencedRelation: "ride_handoffs"
      referencedColumns: ["ride_id","child_id"]
    },{
      foreignKeyName: "ride_events_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: false
      referencedRelation: "ride_trips"
      referencedColumns: ["ride_id"]
    }
                  ]
                },"ride_families": {
                  Row: {
                    "circle_id": string,"family_id": string,"responded_at": string | null,"ride_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "circle_id": string,"family_id": string,"responded_at"?: string | null,"ride_id": string,"status": string
                  }
                  Update: {
                    "circle_id"?: string,"family_id"?: string,"responded_at"?: string | null,"ride_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_families_circle_id_family_id_fkey"
      columns: ["circle_id","family_id"]
isOneToOne: false
      referencedRelation: "circle_families"
      referencedColumns: ["circle_id","family_id"]
    },{
      foreignKeyName: "ride_families_ride_id_circle_id_fkey"
      columns: ["ride_id","circle_id"]
isOneToOne: false
      referencedRelation: "rides"
      referencedColumns: ["id","circle_id"]
    }
                  ]
                },"ride_handoffs": {
                  Row: {
                    "arrived_at": string | null,"child_id": string,"completed_at": string | null,"designated_at": string,"designated_by": string,"family_id": string,"picked_up_at": string | null,"recipient_id": string,"recipient_name": string,"ride_id": string,"status": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "arrived_at"?: string | null,"child_id": string,"completed_at"?: string | null,"designated_at"?: string,"designated_by": string,"family_id": string,"picked_up_at"?: string | null,"recipient_id": string,"recipient_name": string,"ride_id": string,"status"?: string,"version"?: number
                  }
                  Update: {
                    "arrived_at"?: string | null,"child_id"?: string,"completed_at"?: string | null,"designated_at"?: string,"designated_by"?: string,"family_id"?: string,"picked_up_at"?: string | null,"recipient_id"?: string,"recipient_name"?: string,"ride_id"?: string,"status"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_handoffs_family_id_designated_by_fkey"
      columns: ["family_id","designated_by"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    },{
      foreignKeyName: "ride_handoffs_family_id_recipient_id_fkey"
      columns: ["family_id","recipient_id"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    },{
      foreignKeyName: "ride_handoffs_ride_id_child_id_family_id_fkey"
      columns: ["ride_id","child_id","family_id"]
isOneToOne: false
      referencedRelation: "ride_riders"
      referencedColumns: ["ride_id","child_id","family_id"]
    }
                  ]
                },"ride_locations": {
                  Row: {
                    "destination": string,"pickup": string,"ride_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "destination": string,"pickup": string,"ride_id": string
                  }
                  Update: {
                    "destination"?: string,"pickup"?: string,"ride_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_locations_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: true
      referencedRelation: "rides"
      referencedColumns: ["id"]
    }
                  ]
                },"ride_riders": {
                  Row: {
                    "child_id": string,"display_name": string,"family_id": string,"ride_id": string,"seat_requirement": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"display_name": string,"family_id": string,"ride_id": string,"seat_requirement": string
                  }
                  Update: {
                    "child_id"?: string,"display_name"?: string,"family_id"?: string,"ride_id"?: string,"seat_requirement"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_riders_child_id_family_id_fkey"
      columns: ["child_id","family_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id","family_id"]
    },{
      foreignKeyName: "ride_riders_ride_id_family_id_fkey"
      columns: ["ride_id","family_id"]
isOneToOne: false
      referencedRelation: "ride_families"
      referencedColumns: ["ride_id","family_id"]
    }
                  ]
                },"ride_trips": {
                  Row: {
                    "assignment_id": string,"completed_at": string | null,"ride_id": string,"ride_revision": number,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"completed_at"?: string | null,"ride_id": string,"ride_revision": number,"started_at"?: string
                  }
                  Update: {
                    "assignment_id"?: string,"completed_at"?: string | null,"ride_id"?: string,"ride_revision"?: number,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ride_trips_assignment_id_ride_id_ride_revision_fkey"
      columns: ["assignment_id","ride_id","ride_revision"]
isOneToOne: false
      referencedRelation: "driver_assignments"
      referencedColumns: ["id","ride_id","ride_revision"]
    },{
      foreignKeyName: "ride_trips_ride_id_fkey"
      columns: ["ride_id"]
isOneToOne: true
      referencedRelation: "rides"
      referencedColumns: ["id"]
    }
                  ]
                },"rides": {
                  Row: {
                    "cancelled_at": string | null,"cancelled_by": string | null,"circle_id": string,"created_at": string,"created_by": string,"creation_digest": string,"creator_family_id": string,"destination_summary": string,"direction": string,"ends_at": string,"id": string,"pickup_summary": string,"revision": number,"starts_at": string,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"circle_id": string,"created_at"?: string,"created_by": string,"creation_digest": string,"creator_family_id": string,"destination_summary": string,"direction": string,"ends_at": string,"id": string,"pickup_summary": string,"revision"?: number,"starts_at": string,"timezone": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"cancelled_by"?: string | null,"circle_id"?: string,"created_at"?: string,"created_by"?: string,"creation_digest"?: string,"creator_family_id"?: string,"destination_summary"?: string,"direction"?: string,"ends_at"?: string,"id"?: string,"pickup_summary"?: string,"revision"?: number,"starts_at"?: string,"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rides_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rides_circle_id_creator_family_id_fkey"
      columns: ["circle_id","creator_family_id"]
isOneToOne: false
      referencedRelation: "circle_families"
      referencedColumns: ["circle_id","family_id"]
    },{
      foreignKeyName: "rides_circle_id_fkey"
      columns: ["circle_id"]
isOneToOne: false
      referencedRelation: "circles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rides_creator_family_id_created_by_fkey"
      columns: ["creator_family_id","created_by"]
isOneToOne: false
      referencedRelation: "family_members"
      referencedColumns: ["family_id","user_id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "created_at": string,"driver_id": string,"id": string,"label": string,"passenger_seats": number,"retired_at": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"driver_id": string,"id": string,"label": string,"passenger_seats": number,"retired_at"?: string | null,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"driver_id"?: string,"id"?: string,"label"?: string,"passenger_seats"?: number,"retired_at"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_driver_id_fkey"
      columns: ["driver_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_driver_proposal":
{ Args: { "p_available_seats": number,"p_id": string,"p_restraints": boolean,"p_revision": number }; Returns: string
                           },
"accept_invitation":
{ Args: { "p_display_name"?: string,"p_family_id"?: string,"p_kind": string,"p_new_family_name"?: string,"p_token": string }; Returns: string
                           },
"cancel_driver_proposal":
{ Args: { "p_family_id": string,"p_id": string,"p_revision": number }; Returns: string
                           },
"cancel_ride":
{ Args: { "p_family_id": string,"p_revision": number,"p_ride_id": string }; Returns: number
                           },
"circle_roster":
{ Args: { "p_circle_id": string }; Returns: {
              "family_id": string,"family_name": string
            }[]
                           },
"confirm_handoff":
{ Args: { "p_child_id": string,"p_request_id": string,"p_revision": number,"p_ride_id": string,"p_version": number }; Returns: string
                           },
"consent_for_own_children":
{ Args: { "p_child_ids": (string)[],"p_family_id": string,"p_id": string,"p_revision": number }; Returns: string
                           },
"create_circle":
{ Args: { "p_family_id": string,"p_name": string }; Returns: string
                           },
"create_family":
{ Args: { "p_display_name": string,"p_name": string }; Returns: string
                           },
"create_invitation":
{ Args: { "p_email": string,"p_kind": string,"p_scope_id": string }; Returns: {
              "invitation_id": string,"token": string
            }[]
                           },
"create_ride":
{ Args: { "p_child_ids": (string)[],"p_circle_id": string,"p_destination": string,"p_destination_summary": string,"p_direction": string,"p_ends_at": string,"p_family_id": string,"p_id": string,"p_invited_family_ids": (string)[],"p_pickup": string,"p_pickup_summary": string,"p_starts_at": string,"p_timezone": string }; Returns: string
                           },
"decline_driver_proposal":
{ Args: { "p_id": string,"p_revision": number }; Returns: string
                           },
"designate_recipient":
{ Args: { "p_child_id": string,"p_recipient_id": string,"p_revision": number,"p_ride_id": string,"p_version": number }; Returns: number
                           },
"driver_inbox":
{ Args: { "p_after_id"?: string,"p_after_start"?: string,"p_limit"?: number,"p_pending_only"?: boolean }; Returns: {
              "accepted_at": string,"available_seats": number,"booster_count": number,"cancelled_at": string,"child_seat_count": number,"consent_count": number,"coverage": string,"current_assignment_id": string,"current_assignment_release_reason": string,"current_assignment_revision": number,"current_driver_name": string,"current_proposal_id": string,"current_proposal_revision": number,"deadline": string,"destination_summary": string,"driver_id": string,"driver_name": string,"ends_at": string,"is_completed_driver": boolean,"is_current_driver": boolean,"is_driver": boolean,"mode": string,"passenger_seats": number,"pickup_summary": string,"proposal_id": string,"proposal_status": string,"restraints_confirmed": boolean,"ride_id": string,"ride_revision": number,"rider_count": number,"starts_at": string,"timezone": string,"vehicle_id": string,"vehicle_label": string,"vehicle_version": number
            }[]
                           },
"driver_options":
{ Args: { "p_ride_id": string }; Returns: {
              "display_name": string,"driver_family_id": string,"driver_id": string,"passenger_seats": number,"vehicle_id": string,"vehicle_label": string,"vehicle_version": number
            }[]
                           },
"driver_status":
{ Args: { "p_ride_id": string }; Returns: {
              "accepted_at": string,"available_seats": number,"booster_count": number,"cancelled_at": string,"child_seat_count": number,"consent_count": number,"coverage": string,"current_assignment_id": string,"current_assignment_release_reason": string,"current_assignment_revision": number,"current_driver_name": string,"current_proposal_id": string,"current_proposal_revision": number,"deadline": string,"destination_summary": string,"driver_id": string,"driver_name": string,"ends_at": string,"is_completed_driver": boolean,"is_current_driver": boolean,"is_driver": boolean,"mode": string,"passenger_seats": number,"pickup_summary": string,"proposal_id": string,"proposal_status": string,"restraints_confirmed": boolean,"ride_id": string,"ride_revision": number,"rider_count": number,"starts_at": string,"timezone": string,"vehicle_id": string,"vehicle_label": string,"vehicle_version": number
            }[]
                           },
"driver_statuses":
{ Args: { "p_ride_ids": (string)[] }; Returns: {
              "accepted_at": string,"available_seats": number,"booster_count": number,"cancelled_at": string,"child_seat_count": number,"consent_count": number,"coverage": string,"current_assignment_id": string,"current_assignment_release_reason": string,"current_assignment_revision": number,"current_driver_name": string,"current_proposal_id": string,"current_proposal_revision": number,"deadline": string,"destination_summary": string,"driver_id": string,"driver_name": string,"ends_at": string,"is_completed_driver": boolean,"is_current_driver": boolean,"is_driver": boolean,"mode": string,"passenger_seats": number,"pickup_summary": string,"proposal_id": string,"proposal_status": string,"restraints_confirmed": boolean,"ride_id": string,"ride_revision": number,"rider_count": number,"starts_at": string,"timezone": string,"vehicle_id": string,"vehicle_label": string,"vehicle_version": number
            }[]
                           },
"invitation_preview":
{ Args: { "p_kind": string,"p_token": string }; Returns: {
              "expires_at": string,"scope_name": string
            }[]
                           },
"list_invitations":
{ Args: { "p_kind": string,"p_scope_id": string }; Returns: {
              "consumed_at": string,"created_at": string,"email": string,"expires_at": string,"id": string,"revoked_at": string
            }[]
                           },
"propose_driver":
{ Args: { "p_driver_family_id": string,"p_driver_id": string,"p_family_id": string,"p_id": string,"p_revision": number,"p_ride_id": string,"p_vehicle_id": string,"p_vehicle_version": number }; Returns: string
                           },
"record_pickup":
{ Args: { "p_child_id": string,"p_request_id": string,"p_revision": number,"p_ride_id": string,"p_version": number }; Returns: string
                           },
"remove_circle_family":
{ Args: { "p_circle_id": string,"p_family_id": string }; Returns: undefined
                           },
"remove_family_member":
{ Args: { "p_family_id": string,"p_user_id": string }; Returns: undefined
                           },
"report_arrival":
{ Args: { "p_child_id": string,"p_request_id": string,"p_revision": number,"p_ride_id": string,"p_version": number }; Returns: string
                           },
"request_replacement":
{ Args: { "p_deadline": string,"p_driver_family_id": string,"p_driver_id": string,"p_family_id": string,"p_id": string,"p_mode": string,"p_original_assignment_id": string,"p_original_assignment_revision": number,"p_revision": number,"p_ride_id": string,"p_vehicle_id": string,"p_vehicle_version": number }; Returns: string
                           },
"respond_to_ride_invitation":
{ Args: { "p_accept": boolean,"p_child_ids": (string)[],"p_family_id": string,"p_revision": number,"p_ride_id": string }; Returns: number
                           },
"revoke_invitation":
{ Args: { "p_id": string }; Returns: undefined
                           },
"revoke_own_consent":
{ Args: { "p_child_ids": (string)[],"p_family_id": string,"p_id": string,"p_revision": number }; Returns: string
                           },
"ride_offer":
{ Args: { "p_id": string }; Returns: {
              "can_cancel": boolean,"cancelled_at": string,"circle_id": string,"destination_summary": string,"direction": string,"ends_at": string,"family_id": string,"id": string,"pickup_summary": string,"revision": number,"starts_at": string,"status": string,"timezone": string
            }[]
                           },
"ride_offers":
{ Args: { "p_from": string,"p_until": string }; Returns: {
              "can_cancel": boolean,"cancelled_at": string,"circle_id": string,"destination_summary": string,"direction": string,"ends_at": string,"family_id": string,"id": string,"pickup_summary": string,"revision": number,"starts_at": string,"status": string,"timezone": string
            }[]
                           },
"save_own_child":
{ Args: { "p_display_name": string,"p_family_id": string,"p_id": string,"p_revision": number,"p_seat_requirement": string }; Returns: string
                           },
"save_vehicle":
{ Args: { "p_id": string,"p_label": string,"p_passenger_seats": number,"p_retire": boolean,"p_version": number }; Returns: string
                           },
"set_own_ride_riders":
{ Args: { "p_child_ids": (string)[],"p_family_id": string,"p_revision": number,"p_ride_id": string }; Returns: number
                           },
"trip_attention":
{ Args: { "p_after_id"?: string,"p_limit"?: number }; Returns: {
              "awaiting_count": number,"destination_summary": string,"is_driver": boolean,"missing_recipient_count": number,"pickup_summary": string,"ride_id": string,"started_at": string
            }[]
                           },
"withdraw_driver":
{ Args: { "p_id": string,"p_revision": number }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
