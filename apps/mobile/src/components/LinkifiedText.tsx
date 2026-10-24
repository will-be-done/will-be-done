import { Linking } from "react-native";
import { linkifyText } from "@will-be-done/client/utils";
import { Text } from "./Text";

export function LinkifiedText({ text }: { text: string }) {
  return linkifyText(text).map((part) =>
    part.type === "link" ? (
      <Text
        key={part.start}
        className="text-accent underline"
        onPress={() => void Linking.openURL(part.href)}
      >
        {part.value}
      </Text>
    ) : (
      part.value
    ),
  );
}
