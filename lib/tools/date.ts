/**
 * Date tool — gives the LLM access to the current date and time.
 *
 * LLMs have no inherent sense of the current date. This tool lets them
 * call out to get today's date, day of week, and current time (UTC + local).
 * Without it, the model cannot answer "what day is it?" or plan around dates.
 */

import type { OrigenTool } from "@moikapy/origen";

export function createDateTool(): OrigenTool {
  return {
    name: "get_current_date",
    description:
      "Get the current date and time. Use this when you need to know today's date, " +
      "the day of the week, or the current time. No parameters needed — just call it.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const now = new Date();
      const utc = now.toISOString();
      const local = now.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      return JSON.stringify({ utc, local, iso: utc.slice(0, 10) });
    },
  };
}