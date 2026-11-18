const naturalOrder = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** Group relative PDF paths into their actual folders, retaining only search matches. */
export function buildSlideTree(files, search = "") {
  const root = { name: "", path: "", files: [], folders: [], count: 0 };
  const directories = new Map([["", root]]);
  const query = search.trim().toLocaleLowerCase();
  for (const file of files) {
    if (!file.path.toLocaleLowerCase().includes(query)) continue;
    const parts = file.path.split("/");
    parts.pop();
    let parent = root;
    parent.count++;
    for (const name of parts) {
      const path = parent.path ? `${parent.path}/${name}` : name;
      if (!directories.has(path)) {
        const folder = { name, path, files: [], folders: [], count: 0 };
        directories.set(path, folder);
        parent.folders.push(folder);
      }
      parent = directories.get(path);
      parent.count++;
    }
    parent.files.push(file);
  }
  for (const folder of directories.values()) {
    folder.folders.sort(naturalOrder);
    folder.files.sort(naturalOrder);
  }
  return root;
}
