import { defineConfig } from "vitepress";

// Deployed to GitHub Pages as a project site at
// https://amide-init.github.io/transcriptcut/ — base must match the repo
// name so built asset URLs resolve correctly.
export default defineConfig({
  title: "transcriptcut",
  description:
    "Edit video by editing its transcript. Local-first, open source, no cloud account required.",
  base: "/transcriptcut/",
  lastUpdated: true,
  cleanUrls: true,

  head: [["link", { rel: "icon", href: "/transcriptcut/favicon.svg" }]],

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
