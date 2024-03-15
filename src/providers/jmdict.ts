import fs from "fs";
import Constants from "../utils/constants";
import XMLParser from "../utils/parser";
import Downloader from "../utils/downloader";
import { getEnumKeyByEnumValue } from "../utils/common";
import {
  BaseParser,
  IEntry,
  IJapaneseReading,
  IReadingElement,
  IKanjiElement,
  ISense,
  ITranslation,
  IRestrictLexeme,
  Dialect,
  Field,
  FrequencyRating,
  GlossaryType,
  Language,
  Miscellaneous,
  PartOfSpeech,
  ReadingInfo,
  KanjiInfo,
  KanaType,
  EntryType,
  FileType,
} from "../models/index";

class JMdict extends BaseParser {
  override readonly name = "JMdict";
  override readonly sourceUrl = Constants.sourceUrls.JMdict;
  private readonly fileType = FileType.XML;

  protected override downloader: Downloader = new Downloader(
    this.sourceUrl,
    this.name,
    this.fileType
  );

  // Where the source file's download location is.
  protected xmlParser: XMLParser = new XMLParser(
    this.downloader.destinationFile
  );

  public override downloadAndParseSource = async (): Promise<IEntry[]> => {
    // First, download the file.
    await this.downloader.downloadFile();

    // Then, parse to JSON format/file.
    await this.xmlParser.parse();

    // Once parsed, remove .xml data file from downloads.
    Downloader.cleanupDownloads();

    // Read the JSON file returned by xmlParser, convert to JSON object for processing.
    const objects: [{ [x: string]: unknown }] = JSON.parse(
      fs.readFileSync(this.xmlParser.destinationFile.filePath, "utf-8")
    );

    const entries: IEntry[] = [];
    for (let i = 0; i < objects.length; i++) {
      const entry: IEntry | undefined = this.parseEntry(objects[i]);
      entries.push(entry);
    }

    return entries;
  };

  private determineKanaType = (reading: string): KanaType | KanaType[] => {
    let kanaType: KanaType | KanaType[];

    const containsHiragana = Constants.hiraganaRegex.test(reading);
    const containsKatakana = Constants.katakanaRegex.test(reading);

    containsHiragana && containsKatakana
      ? (kanaType = [KanaType.Hiragana, KanaType.Katakana])
      : containsHiragana
      ? (kanaType = KanaType.Hiragana)
      : containsKatakana
      ? (kanaType = KanaType.Katakana)
      : null;

    return kanaType!;
  };

  private parseFrequencyRating = (rating: string): FrequencyRating | string => {
    const frequencyRating: FrequencyRating | undefined = getEnumKeyByEnumValue(
      FrequencyRating,
      rating
    ) as FrequencyRating | undefined;

    switch (frequencyRating) {
      case undefined:
        return rating as string;
      default:
        return frequencyRating;
    }
  };

  private parseGlossary = (gloss: { [x: string]: any }): ITranslation[] => {
    const glossary: ITranslation[] = [];

    for (let i = 0; i < gloss.length; i++) {
      const object = gloss[i];

      const translation: string =
        typeof object === "string" ? object : object._;

      const language: Language =
        (getEnumKeyByEnumValue(Language, object.$["xml:lang"]) as Language) ??
        Language.English;

      const glossaryType: GlossaryType | undefined = getEnumKeyByEnumValue(
        GlossaryType,
        object.$["g_type"]
      ) as GlossaryType;

      (glossary as ITranslation[]).push({
        language: language,
        translation: translation,
        glossaryType: glossaryType,
      });
    }

    return glossary;
  };

  private parseFieldsOrMisc = (
    objectType: "Field" | "Miscellaneous",
    array?: string[]
  ): Field[] | Miscellaneous[] | undefined => {
    if (array === undefined) return;

    const parsed: Field[] | Miscellaneous[] = [];
    for (let i = 0; i < array.length; i++) {
      objectType === "Field"
        ? (parsed as Field[]).push(
            getEnumKeyByEnumValue(Field, array[i]) as Field
          )
        : (parsed as Miscellaneous[]).push(
            getEnumKeyByEnumValue(Miscellaneous, array[i]) as Miscellaneous
          );
    }

    return parsed;
  };

  private parseLexemeRestrictions = (
    stagk?: string[],
    stagr?: string[]
  ): IRestrictLexeme[] | undefined => {
    const restrictions: IRestrictLexeme[] = [];

    if (stagr) restrictions.push({ type: EntryType.Reading, contents: stagr });
    if (stagk) restrictions.push({ type: EntryType.Kanji, contents: stagk });

    if (restrictions.length > 0) return restrictions;
  };

  // During JSON parsing phase, multiple <r_ele> are compiled into one; each item in array is a seperate IReadingElement.
  private parseReadingElements = (
    r_ele: [
      {
        [x: string]: any;
      }
    ]
  ): IReadingElement[] => {
    const readingElements: IReadingElement[] = [];

    for (let i = 0; i < r_ele.length; i++) {
      const element: { [reb: string]: string[] } = r_ele[i];

      const reb: string = element.reb[0];

      const reading: IJapaneseReading = {
        reading: reb,
        kanaType: this.determineKanaType(reb),
      };

      const readingInfo: ReadingInfo[] = element.re_inf.map((info: string) => {
        return getEnumKeyByEnumValue(ReadingInfo, info) as ReadingInfo;
      });

      const frequencyRatings: (FrequencyRating | string)[] = element.re_pri.map(
        (rating: string) => this.parseFrequencyRating(rating)
      );

      readingElements.push({
        reading: reading,
        isTrueKanjiReading: element.hasOwnProperty("re_nokanji"),
        subsetOfNonKanaReadings: element.re_restr,
        readingInfo: readingInfo,
        frequencyRating: frequencyRatings,
      });
    }

    return readingElements;
  };

  // During JSON parsing phase, multiple <sense> are compiled into one; each item in array is a seperate ISense.
  private parseSenseElements = (objects: [{ [x: string]: any }]): ISense[] => {
    const senseElements: ISense[] = [];

    for (let i = 0; i < objects.length; i++) {
      const object: { [x: string]: any } = objects[i];

      const glossary: ITranslation[] = this.parseGlossary(object.gloss);

      const fields: Field[] | undefined = <[]>(
        this.parseFieldsOrMisc("Field", object.field)
      );

      const dialect: Dialect | undefined = getEnumKeyByEnumValue(
        Dialect,
        object.dial
      ) as Dialect;

      const miscellaneous: Miscellaneous[] | undefined = <[]>(
        this.parseFieldsOrMisc("Miscellaneous", object.misc)
      );

      const partOfSpeech: PartOfSpeech | undefined = getEnumKeyByEnumValue(
        PartOfSpeech,
        object.pos
      ) as PartOfSpeech;

      const lexemeRestrictions: IRestrictLexeme[] | undefined =
        this.parseLexemeRestrictions(object.stagk, object.stagr);

      senseElements.push({
        glossary: glossary,
        senseInfo: object.s_inf[0],
        antonyms: object.ant,
        fields: fields,
        dialect: dialect,
        miscellaneous: miscellaneous,
        partOfSpeech: partOfSpeech,
        lexemeRestrictions: lexemeRestrictions,
      });
    }

    return senseElements;
  };

  private parseKanjiElements = (
    k_ele: [
      {
        [x: string]: any;
      }
    ]
  ): IKanjiElement[] => {
    const kanjiElements: IKanjiElement[] = [];
    return kanjiElements;
  };

  private parseEntry = (object: { [x: string]: any }): IEntry => {
    const entry: IEntry = {
      // ent_seq = ["1000000"]
      id: parseInt(object.ent_seq[0] as string),
      readingElements: this.parseReadingElements(object.r_ele),
      senseElements: this.parseSenseElements(object.sense),
      kanjiElements: this.parseKanjiElements(object.k_ele), // TODO: this.parseKanjiElements()
    };

    return entry;
  };
}

export default JMdict;
