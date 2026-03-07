import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Powerwash Booking",
    short_name: "Powerwash",
    description: "Car wash booking and admin management.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#0e7490",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
