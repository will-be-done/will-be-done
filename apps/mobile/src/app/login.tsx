import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { AppLogo } from "@/components/AppLogo";
import { Text, TextInput } from "@/components/Text";
import { trpcClient } from "@/lib/trpc";
import { authUtils } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { cx } from "@/lib/cx";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const authConfig = useQuery({
    queryKey: ["authConfig"],
    queryFn: () => trpcClient.getAuthConfig.query(),
  });

  const login = useMutation({
    mutationFn: () => trpcClient.login.mutate({ email, password }),
    onSuccess: (result) => {
      authUtils.signIn(result);
      router.replace("/spaces");
    },
  });

  if (authUtils.isAuthenticated()) return <Redirect href="/" />;

  const openWebPage = (path: string) =>
    void WebBrowser.openBrowserAsync(`${API_URL}${path}`);

  return (
    <Screen>
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="grow justify-center px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center">
            <AppLogo size={48} />
            <Text className="mt-4 text-2xl font-inter-bold tracking-tight text-white">
              Welcome back
            </Text>
            <Text className="mt-2 text-[14px] text-slate-400">
              Sign in to continue to Will Be Done
            </Text>
          </View>

          <View className="gap-5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-8">
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={() => login.mutate()}
            />

            {login.error && (
              <View className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3">
                <Text className="text-[13px] text-red-400">
                  {login.error.message || "An error occurred"}
                </Text>
              </View>
            )}

            <Pressable
              disabled={login.isPending}
              onPress={() => login.mutate()}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 py-3 active:bg-blue-400 disabled:opacity-50"
              style={{ boxShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.25)" }}
            >
              {login.isPending ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text className="text-[14px] font-inter-semibold text-white">
                    Signing in...
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-[14px] font-inter-semibold text-white">
                    Sign in
                  </Text>
                  <ArrowRight size={16} color="#fff" strokeWidth={2} />
                </>
              )}
            </Pressable>
          </View>

          {authConfig.data?.emailEnabled && (
            <Pressable
              className="mt-5 self-center"
              onPress={() => openWebPage("/forgot-password")}
            >
              <Text className="text-sm text-blue-400">Forgot password?</Text>
            </Pressable>
          )}

          <View className="mt-6 flex-row justify-center">
            <Text className="text-[14px] text-slate-400">
              Don't have an account?{" "}
            </Text>
            <Pressable onPress={() => openWebPage("/signup")}>
              <Text className="text-[14px] font-inter-medium text-blue-400">
                Sign up
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text className="mb-2 text-[13px] font-inter-medium text-slate-300">
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#64748b"
        selectionColor="#3b82f6"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cx(
          "rounded-md border px-4 py-3 text-[14px] text-white",
          focused
            ? "border-blue-500/50 bg-white/[0.07]"
            : "border-white/[0.08] bg-white/[0.05]",
        )}
        {...props}
      />
    </View>
  );
}
