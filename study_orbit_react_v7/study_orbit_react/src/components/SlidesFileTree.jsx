import { useId, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { buildSlideTree } from "../lib/slideTree.js";

const fileSize = size => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

/** Folder disclosures keep selection independent from the visibility of the list. */
export default function SlidesFileTree({ files, search, selectedPath, onSelect }) {
  const tree = useMemo(() => buildSlideTree(files, search), [files, search]);
  const [collapsed, setCollapsed] = useState({});
  const id = useId();
  const query = search.trim().toLocaleLowerCase();
  const fileButton = file => (
    <button key={file.path} type="button" className={`slides-file ${file.path === selectedPath ? "selected" : ""}`} aria-pressed={file.path === selectedPath} title={file.path} onClick={() => onSelect(file.path)}>
      <FileText size={17} /><span><strong>{file.name}</strong><small>{fileSize(file.size)}</small></span>
    </button>
  );
  const folderBranch = folder => {
    // Search opens matching branches without changing the normal folder view.
    const key = JSON.stringify([query, folder.path]);
    const open = !collapsed[key];
    const childrenId = `${id}-${encodeURIComponent(folder.path)}`;
    const containsSelected = selectedPath.startsWith(`${folder.path}/`);
    return <div className="slides-folder-branch" key={folder.path}>
      <button type="button" className={`slides-folder-toggle ${containsSelected ? "contains-selected" : ""}`} aria-label={`Folder ${folder.path}`} aria-expanded={open} aria-controls={childrenId} title={folder.path}
        onClick={() => setCollapsed(previous => ({ ...previous, [key]: open }))}>
        <ChevronRight size={13} className={open ? "is-open" : ""} />{open ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span>{folder.name}</span><small aria-label={`${folder.count} PDFs`}>{folder.count}</small>
      </button>
      <div id={childrenId} className="slides-folder-contents" hidden={!open}>
        {open && <>{folder.files.map(fileButton)}{folder.folders.map(folderBranch)}</>}
      </div>
    </div>;
  };
  if (!tree.count) return <p className="slides-list-message">No PDFs match your search.</p>;
  return <>
    {tree.files.length > 0 && tree.folders.length > 0 && <p className="slides-root-label">In main folder</p>}
    {tree.files.map(fileButton)}
    {tree.folders.map(folderBranch)}
  </>;
}
