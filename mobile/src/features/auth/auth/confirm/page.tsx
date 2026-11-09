import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import * as UI from "@/ui/elements";
import { appReturnPath, emailLinkType, validTokenHash } from "@/lib/auth/paths";
import { confirmEmail } from "@/services/auth";
import { CommandForm, Fields } from "@/ui/command-form";
import Link from "@/ui/link";
export default function Confirm() {
  const params = useLocalSearchParams<{
    token_hash: string;
    type: string;
    next?: string;
  }>();
  const type = emailLinkType(params.type);
  if (!validTokenHash(params.token_hash) || !type)
    return (
      <>
        <UI.Heading1>This link could not be used</UI.Heading1>
        <Link href="/auth/error">Request another link</Link>
      </>
    );
  return (
    <>
      <UI.Heading1>
        {type === "recovery"
          ? "Reset your Pool password"
          : "Confirm your email"}
      </UI.Heading1>
      <UI.Paragraph>
        Continue to use this single-use email link. If it has expired, request a
        new one.
      </UI.Paragraph>
      <CommandForm
        fields={{
          token_hash: params.token_hash,
          type,
          next: appReturnPath(params.next),
        }}
        action={(values) => confirmEmail(new Fields(values))}
        label={type === "recovery" ? "Choose a new password" : "Confirm email"}
      />
      {Platform.OS === "web" && (
        <UI.Button
          onPress={() =>
            Linking.openURL(
              `pool:///auth/confirm?${new URLSearchParams({ token_hash: params.token_hash, type })}`,
            )
          }
        >
          Open in Pool for iOS
        </UI.Button>
      )}
    </>
  );
}
