import {
  SourcePage,
  type SourcePageContent,
  sourceMetadata,
} from "@/components/landing/source-page";

const content: SourcePageContent = {
  slug: "mcp",
  eyebrow: "MCP source",
  title: "Tradstry MCP server",
  summary:
    "Tradstry exposes an authenticated Model Context Protocol server so Claude, ChatGPT and other MCP clients can run a trader's own journal: connect a broker, review trades, read analytics, keep notes and size positions.",
  facts: [
    "Endpoint: https://mcp.tradstry.com/mcp",
    "Authentication: OAuth sign-in with an existing Tradstry account",
    "Tool count: 83 read and write tools",
    "Trading safety: No order placement, withdrawals, or brokerage account control",
  ],
  sections: [
    {
      heading: "What the MCP server is for",
      body: [
        "The MCP server lets an AI client work with the user's own Tradstry data through structured tools instead of pasted screenshots or exported spreadsheets. It covers workspaces, brokerage connection and sync, the trade journal and reviews, manual trades, analytics by period, playbook or tag, notebook notes and folders, playbooks, principles, tags and position sizing.",
        "Write tools change the Tradstry journal, not the connected brokerage account. Deletions and other changes that cannot be undone ask the user to confirm first, and each user's tool calls are rate limited.",
      ],
    },
    {
      heading: "How to connect",
      body: [
        "Use the remote MCP endpoint https://mcp.tradstry.com/mcp in an MCP-compatible client and sign in with the same Tradstry account that owns the journal data. Accounts are created on tradstry.com; signing in through an AI client never creates one.",
        "The server returns OAuth protected-resource metadata at https://mcp.tradstry.com/.well-known/oauth-protected-resource/mcp so clients can discover the authorization server.",
      ],
    },
    {
      heading: "Boundaries",
      body: [
        "Tradstry's MCP server is a journal and analytics interface. It cannot place trades, move money, modify broker credentials, or bypass the user's account permissions.",
        "Model output can be wrong or incomplete. Tradstry is a record-keeping and review tool, so the trader remains responsible for all trading decisions.",
      ],
    },
  ],
};

export const metadata = sourceMetadata(content);

export default function McpPage() {
  return <SourcePage content={content} />;
}
