import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Same mark used in the sidebar's Brand component — one identity, one place to change it.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563EB",
          borderRadius: 8,
          color: "white",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        E
      </div>
    ),
    { ...size },
  );
}
