import JMdict from "../src/providers/jmdict";

jest.setTimeout(120000);

describe("JMdict Class/Module", () => {
  test("Test: {NAME GOES HERE}", async () => {
    const jmdict = new JMdict();
    await jmdict.downloadAndParseSource();
  });
});
