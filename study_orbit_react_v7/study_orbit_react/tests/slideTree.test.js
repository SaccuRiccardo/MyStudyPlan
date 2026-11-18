import test from "node:test";
import assert from "node:assert/strict";
import { buildSlideTree } from "../src/lib/slideTree.js";

const pdf = path => ({ path, name: path.split("/").at(-1), size: 2048 });
const files = ["Week 10/Slides.pdf", "Intro.pdf", "Week 2/Exercises/Recall.pdf", "Week 2/Slides.pdf", "Week 2/Lecture 10.pdf", "Week 2/Lecture 2.pdf"].map(pdf);

test("slide folders keep root PDFs, sibling files with the same name and nested directories distinct", () => {
  const tree = buildSlideTree(files);
  assert.equal(tree.count, 6);
  assert.deepEqual(tree.files.map(file => file.path), ["Intro.pdf"]);
  assert.deepEqual(tree.folders.map(folder => [folder.path, folder.count]), [["Week 2", 4], ["Week 10", 1]]);
  const week = tree.folders[0];
  assert.deepEqual(week.files.map(file => file.name), ["Lecture 2.pdf", "Lecture 10.pdf", "Slides.pdf"]);
  assert.equal(week.folders[0].path, "Week 2/Exercises");
  assert.equal(week.folders[0].files[0].path, "Week 2/Exercises/Recall.pdf");
  assert.equal(tree.folders[1].files[0].path, "Week 10/Slides.pdf");
  assert.equal(files[0].path, "Week 10/Slides.pdf", "Grouping must not reorder the source listing");
});

test("search keeps matches beneath their folder ancestry and accepts folder names as queries", () => {
  const recall = buildSlideTree(files, "  RECALL  ");
  assert.equal(recall.count, 1);
  assert.equal(recall.folders.length, 1);
  assert.equal(recall.folders[0].files.length, 0);
  assert.equal(recall.folders[0].folders[0].path, "Week 2/Exercises");
  assert.equal(buildSlideTree(files, "week 2").count, 4);
  assert.equal(buildSlideTree(files, "Slides.pdf").folders.length, 2);
  assert.equal(buildSlideTree(files, "missing").count, 0);
  assert.equal(buildSlideTree([]).count, 0);
});

test("literal directory names and repeated nested folder names never merge unrelated PDFs", () => {
  const tree = buildSlideTree(["__proto__/Résumé #1.pdf", "A/Shared/One.pdf", "B/Shared/Two.pdf"].map(pdf));
  const paths = tree.folders.flatMap(folder => [...folder.files, ...folder.folders.flatMap(child => child.files)]).map(file => file.path);
  assert.equal(new Set(paths).size, 3);
  assert.ok(paths.includes("__proto__/Résumé #1.pdf"));
});
