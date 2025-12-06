import { FileScanner, File, Folder } from "../src/utils/file-scanner";
import { initConfig } from "../src/config/env.config";

const fileSystem = new Folder("root",
    [
        new File("Apocalypto.2006.1080p.BluRay.x264.mkv"),
        new File("Мастер.и.Маргарита(2024).mkv"),
        new File("Master.i.Margarita.by.HDGroup.(2024).mkv"),
        // Already processed file - should be recognized as done
        new File("Inception (2010) (IMDB 8.8).mkv"),
    ], 
    [
        new Folder("My Trandformes Collection create by Who know who at whener", [
            new File("Transformers.Age.of.Extinction.by.TRGroup.(2014).mkv"),
            new File("Transformeri.Temnaya.Storina.Luni.by.KinoRezka.(2011).mkv"),
        ], [
            new Folder("BUmblebee", [
                new File("BDMV") // this indciates is a Ripped movie
            ])
        ]),
        new Folder("kids", [
            new File("Cars.2006.mkv"),
            new File("Finding.Nemo.2003.mkv"),
            new File("Home.Alone.1990.mkv"),
            new File("Monsters.University.2013.mkv"),
            new File("[R23-K] Мадагаскар 2 - Madagascar Escape 2 Africa [UHD.BDRip.2160p.HEVC.AI.UPSCALE].mkv"),
            // Subtitle files should be skipped
            new File("Movie.Name.2024.RusFull.srt"),
            new File("Movie.Name.2024.Ukr.ac3"),
        ]),
        new Folder("Barankiny.i.kamni.silyS01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay", [
            // S01, E01... indicates this is a series
            new File("Barankiny.i.kamni.silyS01.E01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv"),
            new File("Barankiny.i.kamni.silyS01.E02.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv")
        ]),
        new Folder("Обратная сторона луны",[], [
            new Folder("Обратная сторона Луны", [ // if no number assume 1
                new File("Обратная сторона Луны - S1E01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv"),
                new File("Обратная сторона Луны - S1E02.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv")
            ]),
            new Folder("Обратная сторона Луны-2", [ // if no number assume 1
                new File("Обратная сторона Луны - S2E01.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv"),
                new File("Обратная сторона Луны - S2E02.2025.WEB-DL.HEVC.2160p.SDR.ExKinoRay.mkv")
            ]),
        ]),
        // DVD Rip with VIDEO_TS folder structure
        new Folder("Гардемарины, Вперёд!", [], [
            new Folder("Disc 1", [
                new File("VIDEO_TS") // DVD structure indicator
            ]),
            new Folder("Disc 2", [
                new File("VIDEO_TS")
            ])
        ]),
        // Series with release group prefix in brackets
        new Folder("Аутсорс - S01", [
            new File("[NOOBDL]Аутсорс.S01E01.2160p.WEB-DL.x265.mkv"),
            new File("[NOOBDL]Аутсорс.S01E02.2160p.WEB-DL.x265.mkv"),
        ]),
        // Russian episode pattern with "сер" instead of S##E##
        new Folder("Сериал с русской нумерацией", [
            new File("Сериал 01 сер.mkv"),
            new File("Сериал 02 сер.mkv"),
        ]),
        // Collection with misplaced movie (Spider-Man in Kingsman Collection)
        new Folder("Kingsman Collection", [
            new File("Kingsman.The.Secret.Service.2014.mkv"),
            new File("Spider-Man.Into.the.Spider-Verse.2018.mkv"), // Wrong collection!
        ]),
    ]
);

// this is an E2E tests, meaning to use real LLM calls and TMDB calls
describe("Should correctly detect file types and set names", () => {
    beforeAll(async () => {
        await initConfig();
    });

    it("Should correctly extract name, year", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);

        const parsedItem = fileSystem.files![0].getParsedItem();
        expect(parsedItem?.name).toBe("Apocalypto (2006) (IMDB 7.8).mkv");
    }, 60000);

    it("must handle correctly cyrilic names", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem1 = fileSystem.files![1].getParsedItem();
        expect(parsedItem1?.name).toBe("Мастер и Маргарита (2024) (IMDB 7.2).mkv");
    }, 60000);


    it("must handle correctly names written in transliteration", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem1 = fileSystem.files![2].getParsedItem();
        expect(parsedItem1?.name).toBe("Мастер и Маргарита (2024) (IMDB 7.2).mkv");
    }, 60000);

    it("must correctly name the collection root folder and underlying movie names", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem = fileSystem.folders![0].getParsedItem();
        expect(parsedItem?.name).toBe("Transformers Collection");
        const subParsedItem1 = fileSystem.folders![0].files![0].getParsedItem();
        expect(subParsedItem1?.name).toBe("Transformers: Age of Extinction (2014) (IMDB 5.6).mkv");
        const subParsedItem2 = fileSystem.folders![0].files![1].getParsedItem();
        expect(subParsedItem2?.name).toBe("Transformers: Dark of the Moon (2011) (IMDB 6.2).mkv");
        const subParsedItem3 = fileSystem.folders![0].folders![0].getParsedItem();
        expect(subParsedItem3?.name).toBe("Transformers: Bumblebee (2018) (IMDB 6.7).mkv");
    }, 60000);

    it("must not change the root collection name in case of avrious not quite related movies", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem = fileSystem.folders![1].getParsedItem();
        expect(parsedItem?.name).toBe("kids");
        const file1 = fileSystem.folders![1].files![0].getParsedItem();
        expect(file1?.name).toBe("Cars (2006) (IMDB 7.3).mkv");
        const file2 = fileSystem.folders![1].files![1].getParsedItem();
        expect(file2?.name).toBe("Finding Nemo (2003) (IMDB 8.2).mkv");
        const file3 = fileSystem.folders![1].files![2].getParsedItem();
        expect(file3?.name).toBe("Home Alone (1990) (IMDB 7.7).mkv");
        const file4 = fileSystem.folders![1].files![3].getParsedItem();
        expect(file4?.name).toBe("Monsters University (2013) (IMDB 7.2).mkv");
        const file5 = fileSystem.folders![1].files![4].getParsedItem();
        expect(file5?.name).toBe("Madagascar: Escape 2 Africa (2008) (IMDB 6.7).mkv");
    }, 60000);

    it("should correctly detect the series based on episode files", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem = fileSystem.folders![2].getParsedItem();
        expect(parsedItem?.name).toBe("Баранкины и камни силы (2025) (KP 7.8)");
        const file1 = fileSystem.folders![2].files![0].getParsedItem();
        expect(file1!.name).toBe("Баранкины и камни силы S01E01.mkv");
        const file2 = fileSystem.folders![2].files![1].getParsedItem();
        expect(file2!.name).toBe("Баранкины и камни силы S01E02.mkv");
    }, 60000);

    it("should correctly detect root folder with nested seasone for series", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem = fileSystem.folders![3].getParsedItem();
        expect(parsedItem?.name).toBe("Обратная сторона луны (2025)");
        const folder1 = fileSystem.folders![3].folders![0].getParsedItem();
        expect(folder1!.name).toBe("Обратная сторона луны S01");
        const file11 = fileSystem.folders![3].folders![0].files![0].getParsedItem();
        expect(file11!.name).toBe("Обратная сторона луны S01E01.mkv");
        const file12 = fileSystem.folders![3].folders![0].files![1].getParsedItem();
        expect(file12!.name).toBe("Обратная сторона луны S01E02.mkv");
        const folder2 = fileSystem.folders![3].folders![1].getParsedItem();
        expect(folder2!.name).toBe("Обратная сторона луны S02");
        const file21 = fileSystem.folders![3].folders![1].files![0].getParsedItem();
        expect(file21!.name).toBe("Обратная сторона луны S02E01.mkv");
        const file22 = fileSystem.folders![3].folders![1].files![1].getParsedItem();
        expect(file22!.name).toBe("Обратная сторона луны S02E02.mkv");
    }, 60000);

    it("should recognize already-processed files and keep them unchanged", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const parsedItem = fileSystem.files![3].getParsedItem();
        // Already in correct format - should stay the same
        expect(parsedItem?.name).toBe("Inception (2010) (IMDB 8.8).mkv");
    }, 60000);

    // TODO: Implement skipping of subtitle/audio files
    it.skip("should skip subtitle and audio files (.srt, .ac3)", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const srtFile = fileSystem.folders![1].files![5].getParsedItem();
        const ac3File = fileSystem.folders![1].files![6].getParsedItem();
        // Subtitle/audio files should be marked as Other or skipped
        expect(srtFile?.name).toBe("Movie.Name.2024.RusFull.srt"); // Keep original
        expect(ac3File?.name).toBe("Movie.Name.2024.Ukr.ac3"); // Keep original
    }, 60000);

    // TODO: Implement VIDEO_TS detection for DVD rips
    it.skip("should detect DVD rip folders with VIDEO_TS structure", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const dvdFolder = fileSystem.folders![4].getParsedItem();
        expect(dvdFolder?.name).toBe("Гардемарины, вперёд! (1987) (IMDB 8.1)");
        const disc1 = fileSystem.folders![4].folders![0].getParsedItem();
        expect(disc1?.name).toContain("Disc 1"); // Or specific disc name
    }, 60000);

    // TODO: Fix series name extraction when S01 is in root folder name
    it.skip("should handle series folder with S01 in root folder name", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const seriesFolder = fileSystem.folders![5].getParsedItem();
        expect(seriesFolder?.name).toBe("Аутсорс (2025)");
        const ep1 = fileSystem.folders![5].files![0].getParsedItem();
        expect(ep1?.name).toBe("Аутсорс S01E01.mkv");
        const ep2 = fileSystem.folders![5].files![1].getParsedItem();
        expect(ep2?.name).toBe("Аутсорс S01E02.mkv");
    }, 60000);

    // TODO: Implement Russian episode pattern "## сер" detection
    it.skip("should handle Russian episode pattern with 'сер' instead of S##E##", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const seriesFolder = fileSystem.folders![6].getParsedItem();
        // Should detect as series and normalize episode naming
        const ep1 = fileSystem.folders![6].files![0].getParsedItem();
        expect(ep1?.name).toMatch(/S01E01\.mkv$/);
        const ep2 = fileSystem.folders![6].files![1].getParsedItem();
        expect(ep2?.name).toMatch(/S01E02\.mkv$/);
    }, 60000);

    // TODO: Implement franchise detection to avoid prefixing unrelated movies
    // Currently applies "Kingsman:" prefix to Spider-Man which is wrong
    it.skip("should not apply franchise prefix to unrelated movies in collection", async () => {
        const scanner = new FileScanner();
        await scanner.parse(fileSystem);
        const collection = fileSystem.folders![7].getParsedItem();
        expect(collection?.name).toBe("Kingsman Collection");
        const kingsman = fileSystem.folders![7].files![0].getParsedItem();
        expect(kingsman?.name).toBe("Kingsman: The Secret Service (2015) (IMDB 7.7).mkv");
        // Spider-Man should NOT have "Kingsman:" prefix - it's unrelated to the franchise
        const spiderMan = fileSystem.folders![7].files![1].getParsedItem();
        expect(spiderMan?.name).toBe("Spider-Man: Into the Spider-Verse (2018) (IMDB 8.4).mkv");
    }, 60000);
});