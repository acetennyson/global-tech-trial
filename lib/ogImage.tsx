import { ImageResponse } from "next/og";
import { placeLabel, site } from "./site";

export const ogSize = { width: 1200, height: 630 };
export const ogAlt = `${site.name} by ${site.organization.name}: ${site.tagline}`;

// The 1200x630 card shown when a link to the site is shared (Open Graph and Twitter).
export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b0b0c 0%, #1d1d1f 60%, #0a2540 100%)",
          color: "#f5f5f7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#0071e3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40">
              <path d="M9 21l8 8 15-17" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600 }}>{site.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Tasks that stay in sync.
          </div>
          <div style={{ fontSize: 34, color: "#a1a1a6", lineHeight: 1.3 }}>
            REST API with JWT auth, version-checked edits and offline sync.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: "#a1a1a6" }}>
          <div>
            {`${site.organization.name} | ${site.owner.name}`}
          </div>
          <div>{placeLabel}</div>
        </div>
      </div>
    ),
    { ...ogSize }
  );
}
