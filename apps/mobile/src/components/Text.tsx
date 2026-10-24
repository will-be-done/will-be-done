import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";
import { cx } from "@/lib/cx";

// Inter is loaded as one family per weight, so text defaults to the regular
// face unless the caller picks a `font-inter-*` weight.
const withFont = (className?: string) =>
  cx(!className?.includes("font-inter") && "font-inter", className);

export function Text({ className, ...props }: TextProps) {
  return <RNText className={withFont(className)} {...props} />;
}

export function TextInput({ className, ...props }: TextInputProps) {
  return <RNTextInput className={withFont(className)} {...props} />;
}
