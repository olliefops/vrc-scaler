let cachedData: { [x: string]: any; } = {};

const fetchFile = async (filePath: string) => {
    const file = Bun.file(filePath, { type: "application/json" });

    if (cachedData[filePath]) {
        return cachedData[filePath];

    } else if (await file.exists() && file.size > 0) {
        cachedData[filePath] = await Bun.file(filePath, { type: "application/json" }).json();
        return cachedData[filePath];
    }

    return null;
}

const saveFile = async (filePath: string, data: any) => {
    await Bun.write(filePath, JSON.stringify(data, null, 2));
    cachedData[filePath] = data;
}

export { fetchFile, saveFile };