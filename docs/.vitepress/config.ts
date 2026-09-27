import { defineConfig } from "vitepress";

// Deployed to GitHub Pages under the custom domain
// https://transcriptcut.aamin.me/, served from the domain root -- so base
// is "/". (It was "/transcriptcut/" for the old github.io project-site
// URL; with the custom domain that prefix makes every asset 404.)
export default defineConfig({
  title: "transcriptcut",
  description:
    "Edit video podcasts by editing the transcript: clean audio, speakers, chapters, show notes and Shorts. Local-first, open source, no cloud account required.",
  base: "/",
  lastUpdated: true,
  cleanUrls: true,

  head: [["link", { rel: "icon", href: "/favicon.svg" }]],

  themeConfig: {
    logo: "/favicon.svg",

    nav: [
      { text: "Download", link: "/download" },
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Screenshots", link: "/screenshots" },
      { text: "Status", link: "/status" },
      { text: "Community", link: "/community" },
      {
        text: "Changelog",
        link: "https://github.com/amide-init/transcriptcut/commits/main",
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Editing Workflow", link: "/guide/editing-workflow" },
            { text: "Podcast Workflow", link: "/guide/podcasting" },
            { text: "Scenes, Cards & B-roll", link: "/guide/scenes" },
            { text: "AI-Assisted Editing", link: "/guide/ai-editing" },
            { text: "Security & Self-Hosting", link: "/guide/security" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/amide-init/transcriptcut" },
    ],

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/amide-init/transcriptcut/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "transcriptcut is local-first, open source software.",
    },

    outline: {
      level: [2, 3],
    },
  },
});
