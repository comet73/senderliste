
import { Command } from "commander";
import * as fs from "fs";

interface M3UItem {
  attributes: Record<string, string>;
  location: string;
}

function parseM3U(content: string): M3UItem[] {
  const items: M3UItem[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXTINF:")) {
      const attributes: Record<string, string> = {};
      const attrString = line.substring("#EXTINF:-1 ".length);

      // Parse attributes like tvg-id="...", tvg-name="...", etc.
      const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(attrString)) !== null) {
        attributes[match[1]] = match[2];
      }

      // Next non-empty line is the location
      while (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith("#")) {
          items.push({
            attributes,
            location: nextLine,
          });
          break;
        }
      }
    }
  }

  return items;
}
const program = new Command();

program
  .name("iptv-lauf")
  .description("IPTV playlist tool")
  .version("0.1.0")
  .option(
    "-s, --source <url>",
    "URL of the M3U playlist",
    "https://iptv-org.github.io/iptv/languages/deu.m3u"
  )
  .option(
    "-f, --filter <file>",
    "path to file with channel names to filter",
    "channels.txt"
  )
  .option(
    "-o, --output <file>",
    "path to output M3U file",
    "senderliste.m3u"
  );

program
  .command("create")
  .description("Create filtered IPTV playlist")
  .action(async (options) => {
    try {
      const globalOptions = program.opts<{
        source: string;
        filter: string;
        output: string;
      }>();

      console.log(`source: ${globalOptions.source}`);
      console.log(`filter: ${globalOptions.filter}`);
      console.log(`output: ${globalOptions.output}`);
      // Load filter file
      const filterContent = fs.readFileSync(globalOptions.filter, "utf-8");
      const orderedChannels = filterContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const allowedChannels = new Set(orderedChannels);
      console.log(`Allowed channels: ${orderedChannels.join(", ")}`);

      // Fetch and parse M3U file
      const response = await fetch(globalOptions.source);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      const m3uContent = await response.text();
      const playlist = parseM3U(m3uContent);
      console.log(`Total channels in playlist: ${playlist.length}`);

      // Filter by tvg-id
      const playlistByChannel = new Map<string, M3UItem[]>();
      playlist.forEach((item) => {
        const tvgId = item.attributes?.["tvg-id"] || "";
        if (!allowedChannels.has(tvgId)) {
          return;
        }

        const existingItems = playlistByChannel.get(tvgId) || [];
        existingItems.push(item);
        playlistByChannel.set(tvgId, existingItems);
      });

      const filtered = orderedChannels.flatMap(
        (channel) => playlistByChannel.get(channel) || []
      );

      const outputLines = ["#EXTM3U"];
      filtered.forEach((item) => {
        const attrs = Object.entries(item.attributes || {})
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        outputLines.push(`#EXTINF:-1 ${attrs}`.trimEnd());
        outputLines.push(item.location);
      });

      fs.writeFileSync(globalOptions.output, `${outputLines.join("\n")}\n`, "utf-8");
      console.log(`Wrote ${filtered.length} channels to ${globalOptions.output}`);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
