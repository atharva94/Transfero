const mediaPicker = document.querySelector("#media-picker");
const filePicker = document.querySelector("#file-picker");
const dropZone = document.querySelector("#drop-zone");
const transferSection = document.querySelector("#transfer-section");
const transferList = document.querySelector("#transfer-list");
const transferSummary = document.querySelector("#transfer-summary");
const clearButton = document.querySelector("#clear-button");

const pendingFiles = [];
const transfers = [];
const maxConcurrentUploads = 3;
let activeUploads = 0;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

function updateSummary() {
  const total = transfers.length;
  const done = transfers.filter((transfer) => transfer.status === "complete").length;
  const failed = transfers.filter((transfer) => transfer.status === "failed").length;
  transferSummary.textContent = `${done} of ${total} transferred${failed ? ` · ${failed} failed` : ""}`;
}

function addTransfer(file) {
  const item = document.createElement("li");
  item.className = "transfer-item";

  const details = document.createElement("div");
  details.className = "file-details";
  const name = document.createElement("strong");
  name.className = "file-name";
  name.textContent = file.name;
  const metadata = document.createElement("span");
  metadata.className = "file-metadata";
  metadata.textContent = `${formatBytes(file.size)} · Waiting`;
  details.append(name, metadata);

  const progress = document.createElement("progress");
  progress.max = 100;
  progress.value = 0;
  progress.setAttribute("aria-label", `Uploading ${file.name}`);

  const statusElement = document.createElement("span");
  statusElement.className = "file-status";
  statusElement.textContent = "Waiting";
  item.append(details, progress, statusElement);
  transferList.append(item);

  const transfer = { file, item, metadata, progress, statusElement, status: "queued" };
  transfers.push(transfer);
  pendingFiles.push(transfer);
  transferSection.hidden = false;
  updateSummary();
  processQueue();
}

function queueFiles(fileList) {
  for (const file of fileList) {
    addTransfer(file);
  }
}

function upload(transfer) {
  const request = new XMLHttpRequest();
  request.open("POST", `/upload?name=${encodeURIComponent(transfer.file.name)}`);
  request.upload.addEventListener("progress", (event) => {
    if (!event.lengthComputable) return;
    transfer.progress.value = Math.round((event.loaded / event.total) * 100);
    transfer.statusElement.textContent = `${transfer.progress.value}%`;
  });
  request.addEventListener("load", () => {
    if (request.status >= 200 && request.status < 300) {
      transfer.status = "complete";
      transfer.progress.value = 100;
      transfer.statusElement.textContent = "Done";
      transfer.metadata.textContent = `${formatBytes(transfer.file.size)} · Saved`;
    } else {
      markFailed(transfer);
    }
    finishUpload();
  });
  request.addEventListener("error", () => {
    markFailed(transfer);
    finishUpload();
  });
  request.addEventListener("abort", () => {
    markFailed(transfer);
    finishUpload();
  });
  request.send(transfer.file);

  function finishUpload() {
    activeUploads -= 1;
    updateSummary();
    processQueue();
  }
}

function markFailed(transfer) {
  transfer.status = "failed";
  transfer.statusElement.textContent = "Failed";
  transfer.metadata.textContent = `${formatBytes(transfer.file.size)} · Upload failed`;
  transfer.item.classList.add("failed");
}

function processQueue() {
  while (activeUploads < maxConcurrentUploads && pendingFiles.length > 0) {
    const transfer = pendingFiles.shift();
    activeUploads += 1;
    transfer.status = "uploading";
    transfer.statusElement.textContent = "Uploading";
    transfer.metadata.textContent = `${formatBytes(transfer.file.size)} · Uploading`;
    upload(transfer);
  }
}

function handlePicker(input) {
  input.addEventListener("change", () => {
    queueFiles(input.files);
    input.value = "";
  });
}

handlePicker(mediaPicker);
handlePicker(filePicker);

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  queueFiles(event.dataTransfer.files);
});
dropZone.addEventListener("click", () => filePicker.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    filePicker.click();
  }
});

clearButton.addEventListener("click", () => {
  for (let index = transfers.length - 1; index >= 0; index -= 1) {
    const transfer = transfers[index];
    if (transfer.status === "complete" || transfer.status === "failed") {
      transfer.item.remove();
      transfers.splice(index, 1);
    }
  }
  if (transfers.length === 0) transferSection.hidden = true;
  updateSummary();
});
