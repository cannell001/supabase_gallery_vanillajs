// src/main.js
import supabase from "../lib/supabaseBrowserClient.js"; // SERVICE_ROLE (DEV ONLY)

const els = {
  bucketNameInput: document.getElementById("bucketNameInput"),
  createBucketBtn:  document.getElementById("createBucketBtn"),
  createStatus:     document.getElementById("createBucketStatus"),

  bucketSelect:     document.getElementById("bucketSelect"),
  dropZone:         document.getElementById("dropZone"),
  filePicker:       document.getElementById("filePicker"),
  selectFileBtn:    document.getElementById("selectFileBtn"),
  uploadStatus:     document.getElementById("uploadStatus"),
  loadGalleryBtn:   document.getElementById("loadGalleryBtn"),
  bucketLink:       document.getElementById("bucketLink"),

  fileList:         document.getElementById("fileList"),

  lightbox:         document.getElementById("lightbox"),
  lightboxImg:      document.getElementById("lightboxImage"),
  lightboxCaption:  document.getElementById("lightboxCaption"),
  lightboxClose:    document.getElementById("lightboxClose"),
};

// ---------- Helpers ----------
const ui = {
  info: (el, msg)   => el && (el.textContent = msg, el.style.color = "#d1d5db"),
  ok:   (el, msg)   => el && (el.textContent = msg, el.style.color = "#10b981"),
  err:  (el, msg)   => el && (el.textContent = msg, el.style.color = "#ef4444"),
  clearGallery()    { els.fileList.innerHTML = `
    <div class="gallery-placeholder">
      <p>Your images will appear here.</p>
      <span>Select a bucket and click <strong>Load Gallery</strong> to begin.</span>
    </div>`; },
  setBucketLink(bucket) {
    const studioURL = "https://studio-chocolate.lafrime.foundation/project/default/storage/buckets";
    els.bucketLink.innerHTML = bucket
      ? `<a href="${studioURL}" target="_blank" rel="noopener noreferrer">Open “${bucket}” in Supabase Studio</a>`
      : "";
  }
};

// ---------- Bucket ops ----------
async function loadBucketsIntoSelect() {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    ui.err(els.createStatus, `Failed to load buckets: ${error.message}`);
    return;
  }
  els.bucketSelect.innerHTML = `<option value="">-- Select a Bucket --</option>` +
    data.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
}

async function createBucket() {
  const name = (els.bucketNameInput.value || "").trim();
  if (!name) return ui.err(els.createStatus, "Please enter a bucket name.");
  ui.info(els.createStatus, "Creating bucket…");

  // Create as public for simple galleries in DEV mode
  const { error } = await supabase.storage.createBucket(name, { public: true });
  if (error) return ui.err(els.createStatus, `Error: ${error.message}`);

  ui.ok(els.createStatus, `Bucket "${name}" created (public).`);
  els.bucketNameInput.value = "";

  await loadBucketsIntoSelect();
  // Set newly created bucket as selected (default)
  els.bucketSelect.value = name;
  ui.setBucketLink(""); // clear until gallery is loaded
}

// ---------- Upload ops ----------
function handleFileSelection(files) {
  const bucket = els.bucketSelect.value;
  if (!bucket) return ui.err(els.uploadStatus, "Select a bucket before uploading.");

  if (!files || !files.length) return;

  (async () => {
    ui.info(els.uploadStatus, `Uploading ${files.length} file(s)…`);
    let uploaded = 0;
    for (const file of files) {
      const path = `uploads/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });
      if (error) {
        ui.err(els.uploadStatus, `Upload failed: ${error.message}`);
        return;
      }
      uploaded++;
    }
    ui.ok(els.uploadStatus, `Uploaded ${uploaded} file(s). Click "Load Gallery" to view.`);
  })();
}

// ---------- Gallery ops (only when button clicked) ----------
async function loadGallery() {
  const bucket = els.bucketSelect.value;
  if (!bucket) return ui.err(els.uploadStatus, "Select a bucket to load the gallery.");

  ui.info(els.uploadStatus, "Loading gallery…");
  els.fileList.innerHTML = ""; // clear placeholder

  // We upload to "uploads/", so list there (flat listing)
  const images = await listAllFiles(bucket, "uploads");
  if (!images.length) {
    ui.info(els.uploadStatus, "No images found in this bucket (under uploads/).");
    ui.setBucketLink(bucket);
    return ui.clearGallery();
  }

  // render thumbnails
  const frag = document.createDocumentFragment();
  for (const name of images) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(name);
    const url = data.publicUrl;

    const a = document.createElement("a");
    a.href = "#";
    a.className = "gallery-item";
    a.title = name.split("/").pop();

    const img = document.createElement("img");
    img.src = url;
    img.alt = a.title;

    a.appendChild(img);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openLightbox(url, a.title);
    });

    frag.appendChild(a);
  }
  els.fileList.appendChild(frag);
  ui.ok(els.uploadStatus, `Loaded ${images.length} image(s).`);
  // Add yellow bucket link after successful load
  ui.setBucketLink(bucket);
}

// list files directly under a given prefix (no recursion needed for uploads/)
async function listAllFiles(bucket, prefix = "") {
  const names = [];
  let page = 0;
  const size = 100;

  while (true) {
    const { data, error } = await supabase
      .storage.from(bucket)
      .list(prefix, {
        limit: size,
        offset: page * size,
        sortBy: { column: "name", order: "asc" }
      });

    if (error) {
      // If the folder (prefix) doesn't exist yet, return empty
      return names;
    }
    if (!data || data.length === 0) break;

    for (const entry of data) {
      // Only include files; ignore subfolders
      const isFile = !entry.id ? !!entry.name && !!entry.metadata : true; // tolerate API shape
      if (!isFile) continue;

      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(entry.name)) {
        names.push(fullPath);
      }
    }

    if (data.length < size) break;
    page++;
  }

  return names;
}

// ---------- Lightbox ----------
function openLightbox(url, caption) {
  els.lightboxImg.src = url;
  els.lightboxCaption.textContent = caption || "";
  els.lightbox.style.display = "flex";
}
function closeLightbox() {
  els.lightbox.style.display = "none";
  els.lightboxImg.src = "";
  els.lightboxCaption.textContent = "";
}

// ---------- Events ----------
document.addEventListener("DOMContentLoaded", () => {
  loadBucketsIntoSelect();

  // start with placeholder
  ui.clearGallery();
  ui.setBucketLink("");

  els.createBucketBtn.addEventListener("click", createBucket);

  // Drop zone interactions
  ["dragenter","dragover"].forEach(evt =>
    els.dropZone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); els.dropZone.classList.add("drag-over"); })
  );
  ["dragleave","drop"].forEach(evt =>
    els.dropZone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); els.dropZone.classList.remove("drag-over"); })
  );
  els.dropZone.addEventListener("drop", (e) => handleFileSelection(e.dataTransfer.files));
  els.dropZone.addEventListener("click", () => els.filePicker.click());
  els.selectFileBtn.addEventListener("click", () => els.filePicker.click());
  els.filePicker.addEventListener("change", (e) => handleFileSelection(e.target.files));

  // Explicit gallery load (no auto-load)
  els.loadGalleryBtn.addEventListener("click", loadGallery);

  // Lightbox close
  els.lightboxClose.addEventListener("click", closeLightbox);
  els.lightbox.addEventListener("click", (e)=>{ if(e.target === els.lightbox) closeLightbox(); });
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") closeLightbox(); });
});
