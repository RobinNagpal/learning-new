import "../global.css";
import type { ReactElement, ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  ApiProvider,
  PERSISTED_CACHE_VERSION,
  QUERY_GC_MS,
  createAppQueryClient,
  shouldPersistQuery,
} from "@interestled/api";
import { KeyboardInset, LoadingState } from "@interestled/ui";
import { AuthProvider, useAuth } from "../lib/auth";
import { useAppFocus } from "../lib/focus";
import { backHeader } from "../lib/nav";
import { queryPersister } from "../lib/queryPersister";
import { AuthScreen } from "../components/AuthScreen";

const queryClient = createAppQueryClient();

/**
 * What the cache on disk is allowed to be: no older than the client would keep
 * it in memory, and written by a build whose responses had the same shape.
 */
const persistOptions = {
  persister: queryPersister,
  maxAge: QUERY_GC_MS,
  buster: PERSISTED_CACHE_VERSION,
  // One entry is deliberately not written: see shouldPersistQuery.
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

function Gate({ children }: { children: ReactNode }): ReactElement {
  const { ready, user, client } = useAuth();
  if (!ready) {
    return <LoadingState label="Signing you in…" />;
  }
  if (user === null) {
    return <AuthScreen />;
  }
  return <ApiProvider client={client}>{children}</ApiProvider>;
}

/**
 * Every screen has the same bar. Titles are set here where they are fixed, and
 * on the screen itself where they name something the screen had to load — the
 * bar is the one thing the learner can rely on being in the same place, so it is
 * never conditionally absent.
 */
export default function RootLayout(): ReactElement {
  useAppFocus();

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <StatusBar style="dark" />
        {/* Above every screen, so no screen has to remember the keyboard. */}
        <KeyboardInset>
          <Gate>
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerBackVisible: false,
                headerTintColor: "#111827",
                headerStyle: { backgroundColor: "#f3f4f6" },
                contentStyle: { backgroundColor: "#f3f4f6" },
              }}
            >
              <Stack.Screen name="index" options={{ title: "Your topics" }} />
              <Stack.Screen
                name="profile"
                options={{ title: "Your profile", headerLeft: backHeader("/") }}
              />
              {/* Adding a topic is two screens: what you want, and everything
                  the map is about to be built from with the button under it. */}
              <Stack.Screen
                name="topic/new/index"
                options={{ title: "New topic", presentation: "modal", headerLeft: backHeader("/") }}
              />
              <Stack.Screen
                name="topic/new/review"
                options={{
                  title: "Check it over",
                  presentation: "modal",
                  headerLeft: backHeader("/topic/new"),
                }}
              />
              {/* Titles for these come from the topic they load. */}
              <Stack.Screen name="topic/[topic]/index" options={{ title: "Map" }} />
              {/* Editing is three screens under one address: what the map holds,
                  what the topic is for, and how it is written. */}
              <Stack.Screen name="topic/[topic]/edit/index" options={{ title: "Edit" }} />
              <Stack.Screen name="topic/[topic]/edit/map" options={{ title: "The map" }} />
              <Stack.Screen
                name="topic/[topic]/edit/goals"
                options={{ title: "Goal and starting point" }}
              />
              <Stack.Screen
                name="topic/[topic]/edit/content"
                options={{ title: "How it is written" }}
              />
              <Stack.Screen name="topic/[topic]/[...path]" options={{ title: "" }} />
              <Stack.Screen name="review" options={{ title: "Review", headerLeft: backHeader("/") }} />
            </Stack>
          </Gate>
        </KeyboardInset>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
