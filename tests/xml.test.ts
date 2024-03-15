import fs from "fs";
import Constants from "../src/utils/constants";
import XMLParser from "../src/utils/parser";
import Downloader from "../src/utils/downloader";
import { FileType } from "../src/models/types";

jest.setTimeout(120000);

describe("XMLParser Utility Class", () => {
  // TODO: More robust test; ensure not empty {}?
  test("Test: If not present, download JMdict, then parse the resulting XML file.", async () => {
    const downloader = new Downloader(
      Constants.sourceUrls.JMdict,
      "JMdict",
      FileType.XML
    );

    // Download file to parse if it doesn't exist already:
    if (!fs.existsSync(downloader.destinationFile.filePath))
      await downloader.downloadFile();

    // Instantiate XMLParser with source file details:
    const parser = new XMLParser({
      fileType: FileType.XML,
      filePath: downloader.destinationFile.filePath,
    });

    await parser.parse();

    // Clean-up 'downloads' after parsing; files no longer needed.
    Downloader.cleanupDownloads();

    expect(fs.existsSync(parser.destinationFile.filePath)).toEqual(true);
  });
});
