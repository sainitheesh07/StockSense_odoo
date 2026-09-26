"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Handler = () => void;

/**
 * Subscribes to Postgres Changes over Supabase Realtime for the given tables.
 * Bursts of events are debounced into a single handler call.
 * Returns whether the realtime channel is connected.
 */
export function useRealtime(tables: string[], onChange: Handler) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;
  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    const tableList = key ? key.split(",") : [];
    if (tableList.length === 0) return;

    let pending = false;

    const channel = supabase.channel(
      `stocksense-${Math.random().toString(36).slice(2)}`
    );

    for (const table of tableList) {
      channel.on(
        "postgres_changes" as const,
        { event: "*", schema: "public", table } as const,
        () => {
          pending = true;
        }
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setConnected(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
        setConnected(false);
    });

    const poll = setInterval(() => {
      if (pending) {
        pending = false;
        handlerRef.current();
      }
    }, 250);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [key]);

  return { connected };
}
