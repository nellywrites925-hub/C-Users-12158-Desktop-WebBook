window.Peeksee = window.Peeksee || {};
window.Peeksee.init = function () {
  // Enable keyboard scrolling for the nav-scroll element when focused
  var navScroll = document.querySelector(".nav-scroll");
  console.log("Peeksee: nav-scroll element present?", !!navScroll);
  if (!navScroll) return;

  navScroll.setAttribute("tabindex", "0"); // make focusable
  navScroll.addEventListener("keydown", function (e) {
    var step = 80;
    if (e.key === "ArrowRight") {
      navScroll.scrollBy({ left: step, behavior: "smooth" });
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      navScroll.scrollBy({ left: -step, behavior: "smooth" });
      e.preventDefault();
    }
  });
};

document.addEventListener("DOMContentLoaded", window.Peeksee.init);

// Smooth scroll for support CTA (enhancement)
document.addEventListener("DOMContentLoaded", function () {
  var support = document.getElementById("support-cta");
  if (!support) return;
  support.addEventListener("click", function (e) {
    e.preventDefault();
    var target = document.querySelector(support.getAttribute("href"));
    if (target) target.scrollIntoView({ behavior: "smooth" });
  });
});

/* ---------- Uploads: IndexedDB + file handling ---------- */
(function () {
  var dbName = "peeksee-uploads";
  var uploadsStore = "uploads";
  var contactsStore = "contacts";
  var db;
  // client identifier to mark uploads created from this browser instance
  var CLIENT_ID_KEY = "peeksee_client_id";
  var clientId =
    localStorage.getItem(CLIENT_ID_KEY) ||
    "c_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  // how long (minutes) a user can self-delete their own uploads after upload
  var TEMP_DELETE_MINUTES = 5;
  // File size limits
  var MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per file
  var MAX_CONTACT_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per contact file

  var creatorsStore = "creators";
  // Subscription key - simple client-side flag. Real billing requires server-side handling.
  var SUB_KEY = "peeksee_subscribed";
  // Dev/testing flag: skip the per-upload $1 confirmation when set to '1'
  var SKIP_PER_UPLOAD_FEE_KEY = "peeksee_skip_per_upload_fee";
  var PER_UPLOAD_FEE_ENABLED_KEY = 'peeksee_per_upload_fee_enabled';
  var ADMIN_PASS_HASH_KEY = 'peeksee_admin_pass_hash';

  function isSubscribed() {
    return localStorage.getItem(SUB_KEY) === "1";
  }

  function setSubscribed(val) {
    localStorage.setItem(SUB_KEY, val ? "1" : "0");
    // update any UI
    var ss = document.getElementById("sub-status");
    if (ss) ss.textContent = val ? "Subscribed" : "Not subscribed";
    var ss2 = document.getElementById("sub-status-upload");
    if (ss2) ss2.textContent = val ? "Subscribed" : "Not subscribed";
    var ss3 = document.getElementById("sub-status-subscribe");
    if (ss3) ss3.textContent = val ? "Subscribed" : "Not subscribed";
    // update toggle labels
    var t = document.getElementById("sub-toggle");
    if (t) t.textContent = val ? "Cancel" : "Subscribe";
    var t2 = document.getElementById("sub-toggle-upload");
    if (t2) t2.textContent = val ? "Cancel" : "Subscribe";
    var t3 = document.getElementById("sub-toggle-subscribe");
    if (t3) t3.textContent = val ? "Cancel" : "Subscribe";
  }

  // Wire subscription toggles in the UI (local simulation)
  function wireSubscriptionUI() {
    // main header
    var headerToggle = document.getElementById("sub-toggle");
    if (headerToggle) {
      headerToggle.addEventListener("click", function () {
        var currently = isSubscribed();
        if (!currently) {
          if (
            !confirm(
              "Subscribe for $10/month? This simulates a subscription locally."
            )
          )
            return;
        } else {
          if (
            !confirm(
              "Cancel subscription? This simulates cancellation locally."
            )
          )
            return;
        }
        setSubscribed(!currently);
        showToast(
          !currently
            ? "Subscribed (local simulation)"
            : "Subscription cancelled"
        );
      });
    }

    // upload page toggle
    var upToggle = document.getElementById("sub-toggle-upload");
    if (upToggle) {
      upToggle.addEventListener("click", function () {
        var currently = isSubscribed();
        if (!currently) {
          if (
            !confirm(
              "Subscribe for $10/month? This simulates a subscription locally."
            )
          )
            return;
        } else {
          if (!confirm("Cancel subscription?")) return;
        }
        setSubscribed(!currently);
        showToast(
          !currently
            ? "Subscribed (local simulation)"
            : "Subscription cancelled"
        );
      });
    }

    // subscribe page toggle
    var subToggle = document.getElementById("sub-toggle-subscribe");
    if (subToggle) {
      subToggle.addEventListener("click", function () {
        var currently = isSubscribed();
        if (!currently) {
          if (
            !confirm(
              "Subscribe for $10/month? This simulates a subscription locally."
            )
          )
            return;
        } else {
          if (!confirm("Cancel subscription?")) return;
        }
        setSubscribed(!currently);
        showToast(
          !currently
            ? "Subscribed (local simulation)"
            : "Subscription cancelled"
        );
      });
    }

    // initialize text
    setSubscribed(isSubscribed());
  }

  // Background selector (global): mapping and apply helper
  var BG_KEY = "peeksee_bg_url";
  var BG_ATTR = {
    'https://images.unsplash.com/photo-1517604931442-7f8a3cb81005?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=1':
      'Photo: Stage (Unsplash)',
    'https://images.unsplash.com/photo-1508973378-3a9d0c6a6a23?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=2':
      'Photo: Theater stage (Unsplash)',
    'https://images.unsplash.com/photo-1526403224746-4c5b55a6b892?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=3':
      'Photo: Concert stage (Unsplash)'
  };

  function applyBackground(url) {
    if (!url) return;
    // try to preload the image to ensure it is reachable and not blocked
    var img = new Image();
    img.onload = function () {
      document.body.style.backgroundImage = 'url("' + url + '")';
      document.body.style.backgroundSize = 'cover';
      var att = document.querySelector('.bg-attribution');
      if (att) att.textContent = BG_ATTR[url] || 'Background image: Unsplash (temporary)';
    };
    img.onerror = function () {
      console.warn('Failed to load background image:', url);
      // remove saved bad url so it won't be retried repeatedly
      try { localStorage.removeItem(BG_KEY); } catch (e) {}
      showToast('Failed to load saved background — using default');
    };
    img.src = url;
  }

  // Wire buttons and restore saved background after DOM ready
  document.addEventListener('DOMContentLoaded', function () {
    var bgChoices = document.querySelectorAll('.bg-choice');
    if (bgChoices && bgChoices.length) {
      bgChoices.forEach(function (b) {
        b.addEventListener('click', function () {
          var url = this.dataset.url;
          localStorage.setItem(BG_KEY, url);
          applyBackground(url);
          showToast('Background updated');
        });
      });
    }
    var saved = localStorage.getItem(BG_KEY);
    if (saved) {
      // try to apply saved background; if it fails, apply the first known default
      applyBackground(saved);
    } else {
      // ensure default is applied (use first BG_ATTR key)
      try {
        var defaults = Object.keys(BG_ATTR || {});
        if (defaults && defaults.length) {
          var def = defaults[0];
          applyBackground(def);
          localStorage.setItem(BG_KEY, def);
        }
      } catch (e) {}
    }
  });

  // Count uploads for this client (used to enforce $1 per-upload after first for non-subscribers)
  function getUploadCount() {
    return listFiles().then(function (items) {
      return (items || []).filter(function (i) {
        return i.uploaderId === clientId;
      }).length;
    });
  }

  // Ensure charge before allowing upload when required. Returns a Promise that resolves if allowed.
  function ensureChargeForUpload() {
    if (isSubscribed()) return Promise.resolve();
    if (!isPerUploadFeeEnabled()) return Promise.resolve();
    // honor dev flag to skip per-upload confirmation
    if (localStorage.getItem(SKIP_PER_UPLOAD_FEE_KEY) === "1") return Promise.resolve();
    return getUploadCount().then(function (count) {
      if (!count || count < 1) return Promise.resolve();
      // user already has at least one upload -> require $1 charge per upload
      // try server-side checkout first
      return fetch("/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 100,
          currency: "usd",
          description: "Per-upload fee",
          metadata: { uploaderId: clientId },
        }),
      })
        .then(function (r) {
          if (!r.ok)
            return Promise.reject(new Error("Server checkout unavailable"));
          return r.json();
        })
        .then(function (json) {
          if (json && json.id) {
            // redirect to Stripe Checkout - user will pay and return
            if (!window.Stripe) {
              var s = document.createElement("script");
              s.src = "https://js.stripe.com/v3/";
              s.onload = function () {
                var stripe = Stripe(json.publicKey || "");
                stripe.redirectToCheckout({ sessionId: json.id });
              };
              document.head.appendChild(s);
            } else {
              var stripe = Stripe(json.publicKey || "");
              stripe.redirectToCheckout({ sessionId: json.id });
            }
            // Do not proceed with upload now; user will return after payment
            return Promise.reject(new Error("Redirecting to Checkout"));
          }
          return Promise.reject(new Error("Invalid server response"));
        })
        .catch(function () {
          // fallback: simulate a $1 charge via confirm for local testing
          return new Promise(function (resolve, reject) {
            if (localStorage.getItem(SKIP_PER_UPLOAD_FEE_KEY) === "1") return resolve();
            if (
              confirm(
                "You will be charged $1 for this upload (non-subscriber). Confirm to simulate payment and continue."
              )
            )
              resolve();
            else reject(new Error("Payment required"));
          });
        });
    });
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      // Open without forcing a version to avoid VersionError when an
      // existing DB has a higher version. If stores are missing, re-open
      // with an upgraded version to create them.
      var req = indexedDB.open(dbName);
      req.onsuccess = function (e) {
        var idb = e.target.result;
        // detect missing stores and perform a controlled upgrade if needed
        var missing = [];
        if (!idb.objectStoreNames.contains(uploadsStore)) missing.push(uploadsStore);
        if (!idb.objectStoreNames.contains(contactsStore)) missing.push(contactsStore);
        if (!idb.objectStoreNames.contains(creatorsStore)) missing.push(creatorsStore);
        if (!missing.length) {
          db = idb;
          resolve(db);
          return;
        }
        // close and reopen with an incremented version to create missing stores
        var newVersion = idb.version + 1;
        idb.close();
        var req2 = indexedDB.open(dbName, newVersion);
        req2.onupgradeneeded = function (ev) {
          var idb2 = ev.target.result;
          if (!idb2.objectStoreNames.contains(uploadsStore)) {
            idb2.createObjectStore(uploadsStore, { keyPath: 'id', autoIncrement: true });
          }
          if (!idb2.objectStoreNames.contains(contactsStore)) {
            idb2.createObjectStore(contactsStore, { keyPath: 'id', autoIncrement: true });
          }
          if (!idb2.objectStoreNames.contains(creatorsStore)) {
            idb2.createObjectStore(creatorsStore, { keyPath: 'id', autoIncrement: true });
          }
        };
        req2.onsuccess = function (ev) {
          db = ev.target.result;
          resolve(db);
        };
        req2.onerror = function (ev) {
          reject(ev);
        };
      };
      req.onerror = function (e) {
        reject(e);
      };
    });
  }

  // Ensure DB is ready before performing operations. Returns a Promise that
  // resolves to the db instance.
  function ensureDBReady() {
    if (db) return Promise.resolve(db);
    return openDB();
  }

  function addFile(name, type, blob, creatorId, uploaderId, deletableUntil) {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        console.log('peeksee.addFile start', { name: name, type: type, creatorId: creatorId, uploaderId: uploaderId });
        // validate size
        if (blob && blob.size && blob.size > MAX_UPLOAD_BYTES)
          return reject(new Error("File exceeds maximum size of 25 MB"));
        try {
          var tx = db.transaction([uploadsStore], "readwrite");
          var store = tx.objectStore(uploadsStore);
          var item = {
            name: name,
            type: type,
            blob: blob,
            time: Date.now(),
            creatorId: creatorId || null,
            uploaderId: uploaderId || null,
            deletableUntil: deletableUntil || null,
            // engagement metrics
            views: 0,
            likes: 0,
            dislikes: 0,
            comments: [],
          };
          var req = store.add(item);
          req.onsuccess = function () {
            console.log('peeksee.addFile success', { id: req.result, name: name });
            resolve(req.result);
          };
          req.onerror = function (e) {
            console.error('peeksee.addFile error', e);
            reject(e);
          };
        } catch (e) {
          console.error('peeksee.addFile exception', e);
          reject(e);
        }
      });
    });
  }

  function listFiles() {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction([uploadsStore], "readonly");
          var store = tx.objectStore(uploadsStore);
          var req = store.getAll();
          req.onsuccess = function () {
            resolve(req.result);
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function addContact(record) {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        // validate attachments sizes
        if (record && record.files && Array.isArray(record.files)) {
          for (var i = 0; i < record.files.length; i++) {
            var f = record.files[i];
            if (
              f &&
              f.blob &&
              f.blob.size &&
              f.blob.size > MAX_CONTACT_ATTACHMENT_BYTES
            )
              return reject(new Error("Contact attachment exceeds 10 MB limit"));
          }
        }
        try {
          var tx = db.transaction([contactsStore], "readwrite");
          var store = tx.objectStore(contactsStore);
          var req = store.add(record);
          req.onsuccess = function () {
            resolve(req.result);
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /* Creators helpers */
  function addCreator(obj) {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction([creatorsStore], "readwrite");
          var store = tx.objectStore(creatorsStore);
          var req = store.add(obj);
          req.onsuccess = function () {
            resolve(req.result);
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function listCreators() {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction([creatorsStore], "readonly");
          var store = tx.objectStore(creatorsStore);
          var req = store.getAll();
          req.onsuccess = function () {
            resolve(req.result);
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function getCreator(id) {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction([creatorsStore], "readonly");
          var store = tx.objectStore(creatorsStore);
          var req = store.get(id);
          req.onsuccess = function () {
            resolve(req.result);
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function deleteCreator(id) {
    return ensureDBReady().then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction([creatorsStore], "readwrite");
          var store = tx.objectStore(creatorsStore);
          var req = store.delete(id);
          req.onsuccess = function () {
            resolve();
          };
          req.onerror = function (e) {
            reject(e);
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /* ----- Admin helpers ----- */
  function deleteAllFromStore(storeName) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction([storeName], "readwrite");
      var store = tx.objectStore(storeName);
      var req = store.clear();
      req.onsuccess = function () {
        resolve();
      };
      req.onerror = function (e) {
        reject(e);
      };
    });
  }

  function getAllFromStore(storeName) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction([storeName], "readonly");
      var store = tx.objectStore(storeName);
      var req = store.getAll();
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function (e) {
        reject(e);
      };
    });
  }

  // Simple client-side exporter: create a ZIP-like structure using blobs (fallback: JSON bundle)
  function exportUploadsAsZip(items) {
    if (window.JSZip) {
      var zip = new JSZip();
      var meta = [];
      var p = Promise.resolve();
      items.forEach(function (it) {
        meta.push({ id: it.id, name: it.name, type: it.type, time: it.time });
        // add blob file into zip
        p = p.then(function () {
          return it.blob.arrayBuffer().then(function (buf) {
            zip.file(it.name, buf);
          });
        });
      });
      return p.then(function () {
        zip.file("manifest.json", JSON.stringify(meta, null, 2));
        return zip.generateAsync({ type: "blob" });
      });
    }
    // fallback: export JSON metadata only
    var out = items.map(function (it) {
      return { id: it.id, name: it.name, type: it.type, time: it.time };
    });
    return Promise.resolve(
      new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })
    );
  }

  function exportContactsAsJSON(items) {
    // Strip blob data (too large) and leave metadata; attach simple base64 for small attachments
    var out = items.map(function (it) {
      var copy = {
        id: it.id,
        name: it.name,
        email: it.email,
        subject: it.subject,
        message: it.message,
        time: it.time,
        filePurpose: it.filePurpose,
        consent: it.consent,
        files: [],
      };
      if (it.files && Array.isArray(it.files)) {
        it.files.forEach(function (f) {
          // don't inline blob to avoid huge exports; include name and type only
          copy.files.push({ name: f.name, type: f.type });
        });
      }
      return copy;
    });
    return Promise.resolve(
      new Blob([JSON.stringify(out, null, 2)], { type: "application/json" })
    );
  }

  /* ----- Small UI helpers ----- */
  function showToast(msg, timeout) {
    timeout = timeout || 3500;
    var container = document.getElementById("toast-container");
    if (!container) return; // no toast area
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add("visible");
    }, 20);
    setTimeout(function () {
      el.classList.remove("visible");
      setTimeout(function () {
        try {
          container.removeChild(el);
        } catch (e) {}
      }, 300);
    }, timeout);
  }

  function renderUploads() {
    var container = document.getElementById("uploads-list");
    if (!container) return;
    listFiles().then(function (items) {
      container.innerHTML = "";
      items.sort(function (a, b) {
        return b.time - a.time;
      });
      items.forEach(function (it) {
        var el = document.createElement("div");
        el.className = "upload-item";

        // thumbnail container
        var thumb = document.createElement('div');
        thumb.className = 'upload-thumb';
        var url = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
        if (url && it.type && it.type.indexOf('image/') === 0) {
          var img = document.createElement('img');
          img.src = url;
          thumb.appendChild(img);
        } else if (url && it.type && it.type.indexOf('video/') === 0) {
          var v = document.createElement('video');
          v.src = url;
          v.muted = true;
          v.playsInline = true;
          v.loop = true;
          v.autoplay = true;
          thumb.appendChild(v);
        } else if (url && it.type && it.type.indexOf('audio/') === 0) {
          var a = document.createElement('div');
          a.textContent = 'Audio';
          thumb.appendChild(a);
        } else {
          var a = document.createElement('div');
          a.textContent = it.name ? it.name.split('.').pop().toUpperCase() : 'FILE';
          thumb.appendChild(a);
        }

  el.appendChild(thumb);

        var info = document.createElement('div');
        info.className = 'info';
        var title = document.createElement('div');
        title.textContent = it.name;
        var date = document.createElement('div');
        date.className = 'muted';
        date.textContent = new Date(it.time).toLocaleString();
        info.appendChild(title);
        info.appendChild(date);
        el.appendChild(info);

        var actions = document.createElement('div');
        actions.className = 'actions';

        // Media controls: Play / Pause / Stop / View (for images/text)
        try {
          if (it.type && (it.type.indexOf('video/') === 0 || it.type.indexOf('audio/') === 0)) {
            var playBtn = document.createElement('button');
            playBtn.className = 'upload-button';
            playBtn.title = 'Play';
            playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>';
            playBtn.addEventListener('click', function () {
              // create a transient player in the thumb area if not present
              var existingPlayer = thumb.querySelector('video, audio');
              if (existingPlayer) {
                stopAllMedia();
                try {
                  var pp = existingPlayer.play();
                  if (pp && pp.then) pp.catch(function(err){ console.warn('peeksee: play rejected', err); });
                } catch (e) { console.warn('peeksee: play threw', e); }
                return;
              }
              var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
              if (!src) return showToast('No playable source');
              stopAllMedia();
              var media = document.createElement(it.type.indexOf('video/') === 0 ? 'video' : 'audio');
              media.src = src;
              media.controls = true;
              media.autoplay = true;
              media.style.width = '100%';
              // replace thumb contents temporarily
              thumb.innerHTML = '';
              thumb.appendChild(media);
              // when media ends, restore the thumbnail image/text
              media.addEventListener('ended', function () {
                try { URL.revokeObjectURL(src); } catch (e) {}
                renderUploads();
              });
            });
            var pauseBtn = document.createElement('button');
            pauseBtn.className = 'upload-button';
            pauseBtn.title = 'Pause';
            pauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>';
            pauseBtn.addEventListener('click', function () {
              var media = thumb.querySelector('video, audio');
              if (media && !media.paused) try { media.pause(); } catch (e) {}
            });
            var stopBtn = document.createElement('button');
            stopBtn.className = 'upload-button';
            stopBtn.title = 'Stop';
            stopBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6h12v12H6z" fill="currentColor"/></svg>';
            stopBtn.addEventListener('click', function () {
              var media = thumb.querySelector('video, audio');
              if (media) {
                try { media.pause(); media.currentTime = 0; } catch (e) {}
                // restore thumbnail view
                renderUploads();
              }
            });
            actions.appendChild(playBtn);
            actions.appendChild(pauseBtn);
            actions.appendChild(stopBtn);
          } else {
            // for images/text/pdf provide a View button that opens modal
            var viewBtn = document.createElement('button');
            viewBtn.className = 'upload-button';
            viewBtn.title = 'View';
            viewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5c-7 0-11 6-11 7s4 7 11 7 11-6 11-7-4-7-11-7zm0 11a4 4 0 110-8 4 4 0 010 8z" fill="currentColor"/></svg>';
            viewBtn.addEventListener('click', function () {
              openCreationModal(it);
            });
            actions.appendChild(viewBtn);
          }
        } catch (e) {
          console.error(e);
        }

        // Delete control (if uploader and within deletable window)
        try {
          var now = Date.now();
          if (it.uploaderId && it.uploaderId === clientId && it.deletableUntil && now < it.deletableUntil) {
            var delbtn = document.createElement('button');
            delbtn.textContent = 'Delete';
            delbtn.className = 'thumb-delete';
            delbtn.addEventListener('click', function () {
              if (!confirm('Delete this upload?')) return;
              var tx = db.transaction([uploadsStore], 'readwrite');
              var store = tx.objectStore(uploadsStore);
              var r = store.delete(it.id);
              r.onsuccess = function () {
                try {
                  // revoke object URL if we created one
                  if (url && it.blob) URL.revokeObjectURL(url);
                } catch (e) {}
                renderUploads();
                renderHomeFeatured();
                showToast('Upload deleted');
              };
              r.onerror = function () {
                showToast('Failed to delete upload');
              };
            });
            actions.appendChild(delbtn);
          }
        } catch (e) {
          console.error(e);
        }

        el.appendChild(actions);
        container.appendChild(el);
      });
    });
  }

  function handleFiles(files) {
    var arr = Array.from(files).slice(0, 10); // limit per batch
    var p = Promise.resolve();
    arr.forEach(function (f) {
      p = p.then(function () {
        return addFile(f.name, f.type, f);
      });
    });
    p.then(renderUploads).catch(function (e) {
      console.error(e);
    });
  }

  // wire UI
  openDB().then(function () {
    renderUploads();

    // Seed sample creators and uploads once when DB is empty
    function seedSamplesIfEmpty() {
      // don't reseed if already seeded flag set
      if (localStorage.getItem("peeksee_seeded")) return Promise.resolve();
      return getAllFromStore(uploadsStore)
        .then(function (items) {
          if (items && items.length) {
            localStorage.setItem("peeksee_seeded", "1");
            return;
          }
          // create sample creators
          return Promise.resolve()
            .then(function () {
              return addCreator({
                name: "Ava Example",
                bio: "Multimedia creator and storyteller",
                featured: true,
              });
            })
            .then(function (creatorId1) {
              return addCreator({
                name: "Ben Sample",
                bio: "Photographer and short filmmaker",
                featured: true,
              }).then(function (creatorId2) {
                // sample media: use small public domain samples
                var samples = [
                  {
                    name: "Flower (video)",
                    type: "video/mp4",
                    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                    creatorId: creatorId1,
                  },
                  {
                    name: "Mountains (image)",
                    type: "image/png",
                    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Blue_Mountain_Lake.jpg/320px-Blue_Mountain_Lake.jpg",
                    creatorId: creatorId2,
                  },
                  {
                    name: "Sunrise (image)",
                    type: "image/png",
                    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/200px-PNG_transparency_demonstration_1.png",
                    creatorId: creatorId1,
                  },
                  {
                    name: "Waves (video)",
                    type: "video/mp4",
                    url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
                    creatorId: creatorId2,
                  },
                  {
                    name: "Document (pdf)",
                    type: "application/pdf",
                    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    creatorId: creatorId1,
                  },
                ];
                var p = Promise.resolve();
                samples.forEach(function (s) {
                  p = p.then(function () {
                    return new Promise(function (res, rej) {
                      // store as an upload record with a url fallback - no blob
                      var tx = db.transaction([uploadsStore], "readwrite");
                      var store = tx.objectStore(uploadsStore);
                      var item = {
                        name: s.name,
                        type: s.type,
                        url: s.url,
                        time: Date.now(),
                        creatorId: s.creatorId,
                      };
                      var r = store.add(item);
                      r.onsuccess = function () {
                        res();
                      };
                      r.onerror = function (e) {
                        rej(e);
                      };
                    });
                  });
                });
                return p;
              });
            });
        })
        .then(function () {
          localStorage.setItem("peeksee_seeded", "1");
          renderUploads();
          renderHomeFeatured();
          renderFeaturedCarousel();
          populateCreatorSelects();
          renderAdminCreators();
        });
    }

    seedSamplesIfEmpty().catch(function (e) {
      console.error("Seeding failed", e);
    });

    // Populate featured creator and creations on the home page
    function renderHomeFeatured() {
      var videoEl = document.getElementById("featured-video");
      var bioName = document.getElementById("featured-name");
      var bioIntro = document.getElementById("featured-intro");
      var grid = document.getElementById("creations-grid");
      if (!videoEl && !grid) return;
      getAllFromStore(uploadsStore).then(function (items) {
        if (!items || !items.length) {
          if (bioName) bioName.textContent = "No creators yet";
          if (bioIntro)
            bioIntro.textContent = "Be the first to upload a creation!";
          if (grid) grid.innerHTML = "";
          return;
        }
        // sort by time desc
        items.sort(function (a, b) {
          return b.time - a.time;
        });
        // choose featured: first video or first item
        var featured =
          items.find(function (i) {
            return i.type && i.type.indexOf("video/") === 0;
          }) || items[0];
        if (featured && videoEl) {
          try {
            var fsrc = featured.blob
              ? URL.createObjectURL(featured.blob)
              : featured.url || "";
            if (fsrc) {
              // assign src, ensure element is visible and reload the media
              videoEl.src = fsrc;
              videoEl.style.display = "block";
              // remove any stale poster
              try {
                videoEl.removeAttribute("poster");
              } catch (e) {}
              // call load() to force the browser to re-evaluate the source
              try {
                videoEl.load();
              } catch (e) {}
            } else {
              // no source available
              try {
                videoEl.removeAttribute("src");
                videoEl.load && videoEl.load();
              } catch (e) {}
            }
          } catch (e) {
            console.error(e);
          }
        }

        // derive creator name and title from name if possible
        var creator = "Unknown Creator";
        var intro = "A featured creator from the community.";
        if (featured && featured.name) {
          // heuristic: names like 'creator:Name - Title' or 'Name - Title'
          var parts = featured.name.split("-");
          if (parts.length > 1) {
            creator = parts[0].trim();
          } else creator = featured.name.split(":")[0].trim();
          intro = "Featured for: " + featured.name;
        }
        if (bioName) bioName.textContent = creator;
        if (bioIntro) bioIntro.textContent = intro;

        // render up to 5 creations
        if (grid) {
          grid.innerHTML = "";
          items.slice(0, 5).forEach(function (it) {
            var card = document.createElement("div");
            card.className = "creation-card";
            var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
            if (src && it.type && it.type.indexOf("image/") === 0) {
              var img = document.createElement("img");
              img.src = src;
              card.appendChild(img);
            } else if (src && it.type && it.type.indexOf("video/") === 0) {
              var v = document.createElement("video");
              v.src = src;
              v.controls = true;
              card.appendChild(v);
            } else if (src) {
              var link = document.createElement("a");
              link.href = src;
              link.download = it.name;
              link.textContent = it.name;
              card.appendChild(link);
            } else {
              var link = document.createElement("div");
              link.textContent = it.name || "Item";
              card.appendChild(link);
            }
            var title = document.createElement("div");
            title.className = "title";
            title.textContent = it.name || "Item " + it.id;
            card.appendChild(title);
            grid.appendChild(card);
          });
        }
      });
    }

    renderHomeFeatured();

    // Diagnostic helper: call window.peekseeFeaturedVideoInfo() in console to inspect the featured video element
    window.peekseeFeaturedVideoInfo = function () {
      try {
        var v = document.getElementById("featured-video");
        if (!v) return console.log("No featured video element found");
        console.log("featured video src:", v.src);
        console.log("readyState:", v.readyState);
        console.log("videoWidth x videoHeight:", v.videoWidth, "x", v.videoHeight);
        console.log("paused:", v.paused, "ended:", v.ended);
      } catch (e) {
        console.error(e);
      }
    };

    // Attempt to reload and play the featured video; fall back to poster if video frames are missing
    function reloadFeaturedVideo() {
      try {
        var videoEl = document.getElementById("featured-video");
        if (!videoEl) return;
        // try to re-set the src from the current src to force reload
        var cur = videoEl.src || videoEl.getAttribute('src') || "";
        if (!cur) return console.log('No featured video source to reload');
        // force reload
        try { videoEl.pause(); } catch (e) {}
        // reset src and call load
        var original = cur;
        videoEl.removeAttribute('src');
        try { videoEl.load(); } catch (e) {}
        // small timeout then reassign and load/play
        setTimeout(function () {
          videoEl.src = original;
          try { videoEl.load(); } catch (e) {}
          // attempt play; catch promise rejection silently
          var p = videoEl.play();
          if (p && p.then) p.catch(function () {});
          // after a short interval check if video frames decoded
          setTimeout(function () {
            if (!videoEl.videoWidth || !videoEl.videoHeight) {
              console.warn('Featured video has no decoded frames; showing poster fallback');
              // set a simple poster fallback (a purple placeholder) to avoid black block
              try {
                videoEl.poster = '';
                // create a lightweight data URL SVG poster
                var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="%237c3aed"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="48" fill="#fff">No video preview</text></svg>';
                var data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                videoEl.poster = data;
              } catch (e) {}
            } else {
              console.log('Featured video frames decoded', videoEl.videoWidth, 'x', videoEl.videoHeight);
            }
          }, 700);
        }, 120);
      } catch (e) {
        console.error(e);
      }
    }

    var reloadBtn = document.getElementById('featured-reload');
    if (reloadBtn) reloadBtn.addEventListener('click', reloadFeaturedVideo);

    // Diagnostics: list uploads and basic blob info in the console for debugging
    window.peekseeListUploads = function () {
      openDB().then(function () {
        getAllFromStore(uploadsStore).then(function (items) {
          if (!items || !items.length) return console.log('No uploads');
          console.table(items.map(function (it) { return { id: it.id, name: it.name, type: it.type, size: it.blob && it.blob.size ? it.blob.size : (it.url? 'remote':'n/a') }; }));
          // for blobs, print first bytes as hex (first 64 bytes) for inspection
          items.forEach(function (it) {
            if (it.blob) {
              var fr = new FileReader();
              fr.onload = function (e) {
                var ab = e.target.result;
                var bytes = new Uint8Array(ab.slice(0,64));
                var hex = Array.from(bytes).map(function(b){return ('00'+b.toString(16)).slice(-2)}).join(' ');
                console.log('Upload', it.id, it.name, it.type, it.blob.size, 'first64hex:', hex);
              };
              fr.onerror = function () { console.warn('Failed to read blob for', it.id); };
              fr.readAsArrayBuffer(it.blob.slice(0,64));
            } else {
              console.log('Upload', it.id, it.name, 'remote url:', it.url, 'type:', it.type);
            }
          });
        });
      });
    };

    // Self-test helper: attempt to store a tiny text blob and verify it's persisted
    window.peekseeSelfTestUploads = function () {
      var name = 'selftest-' + Date.now() + '.txt';
      var blob = new Blob(["peeksee-selftest"], { type: 'text/plain' });
      console.log('peeksee: running self-test addFile for', name);
      addFile(name, 'text/plain', blob, null, clientId, Date.now() + 60000)
        .then(function (id) {
          console.log('peeksee: addFile succeeded, id=', id);
          // verify by reading all files and finding this name
          listFiles().then(function (items) {
            var found = (items || []).find(function (it) { return it.id === id || it.name === name; });
            if (found) console.log('peeksee: self-test verified stored record', found);
            else console.error('peeksee: self-test could not find stored record');
          }).catch(function (e) { console.error('peeksee: listFiles failed', e); });
        })
        .catch(function (err) {
          console.error('peeksee: self-test addFile failed', err);
        });
    };

    // Console helpers to toggle skipping the per-upload $1 prompt during testing
    window.peekseeSkipPerUploadFee = function (enable) {
      if (enable) localStorage.setItem(SKIP_PER_UPLOAD_FEE_KEY, "1");
      else localStorage.removeItem(SKIP_PER_UPLOAD_FEE_KEY);
      console.log('peeksee: skip per-upload fee set to', enable ? 'ON' : 'OFF');
    };
    window.peekseeIsSkippingPerUploadFee = function () {
      return localStorage.getItem(SKIP_PER_UPLOAD_FEE_KEY) === "1";
    };

    // Per-upload fee enabled getter/setter
    function isPerUploadFeeEnabled() {
      return localStorage.getItem(PER_UPLOAD_FEE_ENABLED_KEY) !== '0';
    }
    function setPerUploadFeeEnabled(enabled) {
      localStorage.setItem(PER_UPLOAD_FEE_ENABLED_KEY, enabled ? '1' : '0');
    }
    // Admin helpers (very lightweight client-only auth using a stored hash)
    function sha256(text) {
      // returns a Promise<string> hex
      var enc = new TextEncoder();
      var data = enc.encode(text);
      return crypto.subtle.digest('SHA-256', data).then(function (hash) {
        var hex = Array.from(new Uint8Array(hash)).map(function (b) { return ('00' + b.toString(16)).slice(-2); }).join('');
        return hex;
      });
    }
    function adminSetPassphrase(pass) {
      return sha256(pass).then(function (h) {
        localStorage.setItem(ADMIN_PASS_HASH_KEY, h);
        return true;
      });
    }
    function adminCheckPassphrase(pass) {
      var stored = localStorage.getItem(ADMIN_PASS_HASH_KEY);
      if (!stored) return Promise.resolve(false);
      return sha256(pass).then(function (h) {
        return h === stored;
      });
    }

    // Render the full creations grid (used on creations.html)
    function renderCreationsGrid() {
      var grid = document.getElementById("creations-grid");
      if (!grid) return;
      getAllFromStore(uploadsStore).then(function (items) {
        items = items || [];
        items.sort(function (a, b) {
          return b.time - a.time;
        });
        grid.innerHTML = "";
        items.forEach(function (it) {
          var card = document.createElement("div");
          card.className = "creation-card";
          card.dataset.id = it.id;
          var wrap = document.createElement("div");
          wrap.className = "media-wrap";
          var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
          if (src && it.type && it.type.indexOf("image/") === 0) {
            var img = document.createElement("img");
            img.src = src;
            wrap.appendChild(img);
          } else if (src && it.type && it.type.indexOf("video/") === 0) {
            var v = document.createElement("video");
            v.src = src;
            v.controls = false;
            wrap.appendChild(v);
          } else if (src && it.type && it.type.indexOf("audio/") === 0) {
            var a = document.createElement("audio");
            a.src = src;
            a.controls = false;
            wrap.appendChild(a);
          } else if (src) {
            var span = document.createElement("div");
            span.textContent = it.name || "File";
            wrap.appendChild(span);
          }
          card.appendChild(wrap);
          // small action icons overlay
          var actions = document.createElement("div");
          actions.className = "card-actions";
          var likeBtn = document.createElement("button");
          likeBtn.className = "icon-btn";
          likeBtn.innerHTML = '<span class="icon-heart">❤</span>';
          likeBtn.title = "Love";
          likeBtn.dataset.id = it.id;
          likeBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            updateEngagement(Number(this.dataset.id), "like");
          });
          var trashBtn = document.createElement("button");
          trashBtn.className = "icon-btn";
          trashBtn.innerHTML = '<span class="icon-trash">🗑️</span>';
          trashBtn.title = "Trash";
          trashBtn.dataset.id = it.id;
          trashBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            updateEngagement(Number(this.dataset.id), "dislike");
          });
          actions.appendChild(likeBtn);
          actions.appendChild(trashBtn);
          card.appendChild(actions);
          // badges for counts
          var badges = document.createElement("div");
          badges.className = "badge";
          var bLikes = document.createElement("div");
          bLikes.className = "b";
          bLikes.textContent = "❤ " + (it.likes || 0);
          var bComments = document.createElement("div");
          bComments.className = "b";
          bComments.textContent =
            "💬 " + ((it.comments && it.comments.length) || 0);
          badges.appendChild(bLikes);
          badges.appendChild(bComments);
          card.appendChild(badges);
          var title = document.createElement("div");
          title.className = "title";
          title.textContent = it.name || "Item " + it.id;
          card.appendChild(title);
          card.addEventListener("click", function () {
            openCreationModal(it);
          });
          grid.appendChild(card);
        });
      });
    }

    // Modal behavior for viewing a creation fullscreen
    function openCreationModal(it) {
      var modal = document.getElementById("creation-modal");
      var body = document.getElementById("creation-modal-body");
      var caption = document.getElementById("creation-modal-caption");
      if (!modal || !body) return;
      body.innerHTML = "";
      caption.textContent = it.name || "";
      var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
      // stop any other playing media first
      stopAllMedia();
      if (src && it.type && it.type.indexOf("image/") === 0) {
        var img = document.createElement("img");
        img.src = src;
        body.appendChild(img);
      } else if (src && it.type && it.type.indexOf("video/") === 0) {
        var v = document.createElement("video");
        v.src = src;
        v.controls = true;
        v.autoplay = true;
        v.muted = false;
        v.playsInline = true;
        body.appendChild(v);
        // attempt to play and silence promise rejections
        try { var p = v.play(); if (p && p.then) p.catch(function(){}); } catch(e){}
      } else if (src && it.type && it.type.indexOf("audio/") === 0) {
        var a = document.createElement("audio");
        a.src = src;
        a.controls = true;
        a.autoplay = true;
        body.appendChild(a);
        try { var p2 = a.play(); if (p2 && p2.then) p2.catch(function(){}); } catch(e){}
      } else if (src) {
        // attempt to guess audio for common extensions if mime missing
        if (it.name && it.name.match(/\.mp3$|\.wav$|\.ogg$/i)) {
          var aa = document.createElement("audio");
          aa.src = src;
          aa.controls = true;
          aa.autoplay = true;
          body.appendChild(aa);
        } else {
          var link = document.createElement("a");
          link.href = src;
          link.textContent = it.name || "Download file";
          link.download = it.name || "";
          body.appendChild(link);
        }
      }

      // Background selector: persist chosen background image and attribution
      var BG_KEY = "peeksee_bg_url";
      // (applyBackground defined later alongside BG_ATTR)
      // wire background choice buttons
      var bgChoices = document.querySelectorAll(".bg-choice");
      if (bgChoices && bgChoices.length) {
        bgChoices.forEach(function (b) {
          b.addEventListener("click", function () {
            var url = this.dataset.url;
            localStorage.setItem(BG_KEY, url);
            applyBackground(url);
            showToast("Background updated");
          });
        });
        var saved = localStorage.getItem(BG_KEY);
        if (saved) applyBackground(saved);
      }
        var BG_ATTR = {
          'https://images.unsplash.com/photo-1517604931442-7f8a3cb81005?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=1': 'Photo: Stage by Unsplash user',
          'https://images.unsplash.com/photo-1508973378-3a9d0c6a6a23?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=2': 'Photo: Theater stage by Unsplash user',
          'https://images.unsplash.com/photo-1526403224746-4c5b55a6b892?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.0.3&s=3': 'Photo: Concert stage by Unsplash user'
        };
        function applyBackground(url) {
          if (!url) return;
          document.body.style.backgroundImage = 'url("' + url + '")';
          var att = document.querySelector('.bg-attribution');
          if (att) att.textContent = BG_ATTR[url] || 'Background image: Unsplash (temporary)';
          // ensure content overlay readability
          document.body.style.backgroundSize = 'cover';
        }
      modal.setAttribute("aria-hidden", "false");
      // focus close button for accessibility
      var closeBtn = document.getElementById("creation-modal-close");
      if (closeBtn) closeBtn.focus();
      // set modal engagement buttons data-id and meta
      try {
        var likeBtn = document.getElementById("modal-like");
        var dislikeBtn = document.getElementById("modal-dislike");
        var commentBtn = document.getElementById("modal-comment");
        var meta = document.getElementById("modal-engage-meta");
        if (likeBtn) likeBtn.dataset.id = it.id;
        if (dislikeBtn) dislikeBtn.dataset.id = it.id;
        if (commentBtn) commentBtn.dataset.id = it.id;
        if (meta)
          meta.textContent =
            "Views: " +
            (it.views || 0) +
            " • Likes: " +
            (it.likes || 0) +
            " • Comments: " +
            (it.comments ? it.comments.length : 0);
      } catch (e) {}
      // increment view count and persist
      try {
        var tx = db.transaction([uploadsStore], "readwrite");
        var store = tx.objectStore(uploadsStore);
        store.get(it.id).onsuccess = function (e) {
          var rec = e.target.result;
          if (!rec) return;
          rec.views = (rec.views || 0) + 1;
          store.put(rec).onsuccess = function () {
            // update any discover UI
            renderDiscover();
            renderCreationsGrid();
            // refresh modal comments view
            try {
              renderModalComments(rec);
            } catch (e) {}
          };
        };
      } catch (e) {}
    }

    var modalClose = document.getElementById("creation-modal-close");
    function closeCreationModal() {
      try {
        var modal = document.getElementById("creation-modal");
        if (!modal) return;
        modal.setAttribute("aria-hidden", "true");
        var body = document.getElementById("creation-modal-body");
        if (body) body.innerHTML = "";
        // stop any playing media in modal and revoke any object URLs
        try {
          var m = modal && modal.querySelector('video, audio');
          if (m) { try { m.pause(); m.currentTime = 0; } catch (e) {} }
          var imgs = modal && modal.querySelectorAll('img');
          imgs && imgs.forEach(function(im){ if (im && im.src && im.src.indexOf('blob:')===0) try{ URL.revokeObjectURL(im.src); }catch(e){} });
          if (m && m.src && m.src.indexOf('blob:')===0) try{ URL.revokeObjectURL(m.src); } catch(e) {}
        } catch (e) {}
        // clear modal engagement buttons
        try {
          var likeBtn = document.getElementById("modal-like");
          var dislikeBtn = document.getElementById("modal-dislike");
          var commentBtn = document.getElementById("modal-comment");
          var meta = document.getElementById("modal-engage-meta");
          if (likeBtn) likeBtn.dataset.id = 0;
          if (dislikeBtn) dislikeBtn.dataset.id = 0;
          if (commentBtn) commentBtn.dataset.id = 0;
          if (meta) meta.textContent = "";
        } catch (e) {}
      } catch (e) {}
    }

    if (modalClose) modalClose.addEventListener('click', closeCreationModal);

    // wire inline modal close button(s)
    var modalCloseInlineBtns = document.querySelectorAll('#modal-close-inline');
    modalCloseInlineBtns.forEach(function(b){ b.addEventListener('click', closeCreationModal); });

    // helper to stop any playing media on the page (so only one plays at a time)
    function stopAllMedia() {
      try {
        // pause any video/audio elements in the document
        var medias = document.querySelectorAll('video, audio');
        medias.forEach(function (m) {
          try { if (!m.paused) m.pause(); } catch (e) {}
        });
      } catch (e) {}
    }

    // Close modal on ESC
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var modal = document.getElementById("creation-modal");
        if (modal) modal.setAttribute("aria-hidden", "true");
        var body = document.getElementById("creation-modal-body");
        if (body) body.innerHTML = "";
        // clear modal engagement buttons on ESC as well
        try {
          var likeBtn = document.getElementById("modal-like");
          var dislikeBtn = document.getElementById("modal-dislike");
          var commentBtn = document.getElementById("modal-comment");
          var meta = document.getElementById("modal-engage-meta");
          if (likeBtn) likeBtn.dataset.id = 0;
          if (dislikeBtn) dislikeBtn.dataset.id = 0;
          if (commentBtn) commentBtn.dataset.id = 0;
          if (meta) meta.textContent = "";
        } catch (e) {}
      }
      // modal playback keyboard shortcuts
      try {
        var modal = document.getElementById('creation-modal');
        if (modal && modal.getAttribute('aria-hidden') === 'false') {
          var media = modal.querySelector('video, audio');
          if (e.key === ' ' || e.key === 'k') {
            e.preventDefault();
            if (media) {
              if (media.paused) {
                try { media.play(); } catch (er) {}
              } else {
                try { media.pause(); } catch (er) {}
              }
            }
          } else if (e.key === 's') {
            if (media) { try { media.pause(); media.currentTime = 0; } catch (er) {} }
          }
        }
      } catch (er) {}
    });

    // helper: render the comments list inside modal for a record
    function renderModalComments(rec) {
      var cont = document.getElementById("modal-comments");
      if (!cont) return;
      cont.innerHTML = "";
      var comments = rec.comments || [];
      if (!comments.length) {
        cont.innerHTML = '<div class="muted">No comments yet.</div>';
        return;
      }
      comments
        .slice()
        .reverse()
        .forEach(function (c) {
          var el = document.createElement("div");
          el.className = "comment";
          var meta = document.createElement("div");
          meta.className = "meta";
          meta.textContent = new Date(c.time).toLocaleString();
          var txt = document.createElement("div");
          txt.className = "text";
          txt.textContent = c.text;
          el.appendChild(meta);
          el.appendChild(txt);
          cont.appendChild(el);
        });
    }

    // wire modal post button
    var modalPost = document.getElementById("modal-comment-post");
    if (modalPost) {
      modalPost.addEventListener("click", function () {
        var id = Number(this.dataset.id || 0);
        var input = document.getElementById("modal-comment-input");
        if (!input) return;
        var txt = input.value.trim();
        if (!txt) return;
        updateEngagement(id, "comment", txt);
        input.value = "";
      });
    }

    // Ensure creations grid updated when uploads change
    renderCreationsGrid();

    // Render Discover page (shows trending by views)
    function renderDiscover() {
      var grid = document.getElementById("discover-grid");
      if (!grid) return;
      getAllFromStore(uploadsStore).then(function (items) {
        items = items || [];
        items.sort(function (a, b) {
          return (b.views || 0) - (a.views || 0);
        });
        grid.innerHTML = "";
        items.slice(0, 30).forEach(function (it) {
          var card = document.createElement("div");
          card.className = "creation-card";
          card.dataset.id = it.id;
          var wrap = document.createElement("div");
          wrap.className = "media-wrap";
          var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
          if (src && it.type && it.type.indexOf("image/") === 0) {
            var img = document.createElement("img");
            img.src = src;
            wrap.appendChild(img);
          } else if (src && it.type && it.type.indexOf("video/") === 0) {
            var v = document.createElement("video");
            v.src = src;
            v.controls = false;
            wrap.appendChild(v);
          } else if (src && it.type && it.type.indexOf("audio/") === 0) {
            var a = document.createElement("audio");
            a.src = src;
            a.controls = false;
            wrap.appendChild(a);
          } else if (src) {
            var span = document.createElement("div");
            span.textContent = it.name || "File";
            wrap.appendChild(span);
          }
          card.appendChild(wrap);
          var title = document.createElement("div");
          title.className = "title";
          title.textContent = it.name || "Item " + it.id;
          card.appendChild(title);
          var meta = document.createElement("div");
          meta.className = "muted";
          meta.textContent =
            "Views: " +
            (it.views || 0) +
            " • Likes: " +
            (it.likes || 0) +
            " • Comments: " +
            (it.comments ? it.comments.length : 0);
          card.appendChild(meta);
          card.addEventListener("click", function () {
            openCreationModal(it);
          });
          grid.appendChild(card);
        });
      });
    }

    // Button handlers inside creation modal: Like, Trash (dislike), Comment
    document.addEventListener("click", function (e) {
      if (!e.target) return;
      if (e.target.id === "modal-like") {
        var id = Number(e.target.dataset.id || 0);
        updateEngagement(id, "like");
      } else if (e.target.id === "modal-dislike") {
        var id = Number(e.target.dataset.id || 0);
        updateEngagement(id, "dislike");
      } else if (e.target.id === "modal-comment") {
        var id = Number(e.target.dataset.id || 0);
        var txt = prompt("Add comment");
        if (!txt) return;
        updateEngagement(id, "comment", txt);
      }
    });

    function updateEngagement(id, type, payload) {
      try {
        var tx = db.transaction([uploadsStore], "readwrite");
        var store = tx.objectStore(uploadsStore);
        var req = store.get(id);
        req.onsuccess = function (e) {
          var rec = e.target.result;
          if (!rec) return;
          if (type === "like") rec.likes = (rec.likes || 0) + 1;
          else if (type === "dislike") rec.dislikes = (rec.dislikes || 0) + 1;
          else if (type === "comment") {
            rec.comments = rec.comments || [];
            rec.comments.push({ text: payload, time: Date.now() });
          }
          store.put(rec).onsuccess = function () {
            renderDiscover();
            renderCreationsGrid();
            // update modal meta if open
            try {
              var metaEl = document.getElementById("modal-engage-meta");
              var likeBtn = document.getElementById("modal-like");
              var dislikeBtn = document.getElementById("modal-dislike");
              var commentBtn = document.getElementById("modal-comment");
              if (metaEl)
                metaEl.textContent =
                  "Views: " +
                  (rec.views || 0) +
                  " • Likes: " +
                  (rec.likes || 0) +
                  " • Comments: " +
                  (rec.comments ? rec.comments.length : 0);
              if (likeBtn) likeBtn.dataset.id = rec.id;
              if (dislikeBtn) dislikeBtn.dataset.id = rec.id;
              if (commentBtn) commentBtn.dataset.id = rec.id;
              // update modal numeric badges if present
              try {
                var likeCount = document.querySelector('.modal-controls .count-like');
                var commentCount = document.querySelector('.modal-controls .count-comment');
                if (likeCount) likeCount.textContent = rec.likes || 0;
                if (commentCount) commentCount.textContent = (rec.comments && rec.comments.length) || 0;
              } catch (e) {}
            } catch (e) {}
            showToast("Thanks for the feedback");
          };
        };
      } catch (e) {
        console.error(e);
      }
    }

    // call renderDiscover if on Discover page
    if (document.getElementById("discover-grid")) renderDiscover();

    var runDiag = document.getElementById("run-diagnostics");
    if (runDiag)
      runDiag.addEventListener("click", function () {
        if (window.peekseeDiagnostics) window.peekseeDiagnostics();
        else console.log("Diagnostics not available");
      });

    // If on admin page, render admin lists and wire buttons
    function renderAdminUploads() {
      var container = document.getElementById("admin-uploads");
      if (!container) return;
      getAllFromStore(uploadsStore).then(function (items) {
        container.innerHTML = "";
        items.sort(function (a, b) {
          return b.time - a.time;
        });
        items.forEach(function (it) {
          var el = document.createElement("div");
          el.className = "upload-item";
          var info = document.createElement("div");
          info.className = "info";
          var title = document.createElement("div");
          title.textContent = it.name + " (" + (it.type || "n/a") + ")";
          var date = document.createElement("div");
          date.className = "muted";
          date.textContent = new Date(it.time).toLocaleString();
          info.appendChild(title);
          info.appendChild(date);
          el.appendChild(info);

          var actions = document.createElement("div");
          // View / Play controls
          try {
            var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
            if (it.type && (it.type.indexOf('video/') === 0 || it.type.indexOf('audio/') === 0)) {
              var play = document.createElement('button');
              play.className = 'upload-button';
              play.title = 'Play';
              play.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>';
              play.addEventListener('click', function () {
                // open modal and play
                openCreationModal(it);
              });
              var pause = document.createElement('button');
              pause.className = 'upload-button';
              pause.title = 'Pause';
              pause.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>';
              pause.addEventListener('click', function () {
                var modal = document.getElementById('creation-modal');
                var m = modal && modal.querySelector('video, audio');
                if (m && !m.paused) try { m.pause(); } catch (e) {}
              });
              var stop = document.createElement('button');
              stop.className = 'upload-button';
              stop.title = 'Stop';
              stop.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6h12v12H6z" fill="currentColor"/></svg>';
              stop.addEventListener('click', function () {
                var modal = document.getElementById('creation-modal');
                var m = modal && modal.querySelector('video, audio');
                if (m) { try { m.pause(); m.currentTime = 0; } catch (e) {} }
              });
              actions.appendChild(play);
              actions.appendChild(pause);
              actions.appendChild(stop);
            } else {
              var view = document.createElement('button');
              view.textContent = 'View';
              view.className = 'upload-button';
              view.addEventListener('click', function () { openCreationModal(it); });
              actions.appendChild(view);
            }
          } catch (e) {
            console.error(e);
          }

          var dl = document.createElement("a");
          dl.href = it.blob ? URL.createObjectURL(it.blob) : it.url || "#";
          dl.download = it.name;
          dl.textContent = "Download";
          dl.style.marginRight = "8px";
          actions.appendChild(dl);
          var del = document.createElement("button");
          del.textContent = "Delete";
          del.className = "upload-button";
          del.addEventListener("click", function () {
            if (!confirm("Delete this upload?")) return;
            var tx = db.transaction([uploadsStore], "readwrite");
            var store = tx.objectStore(uploadsStore);
            var r = store.delete(it.id);
            r.onsuccess = function () {
              renderAdminUploads();
              renderUploads();
              showToast("Upload deleted");
            };
            r.onerror = function () {
              showToast("Failed to delete upload");
            };
          });
          actions.appendChild(del);

          // Feature toggle (admin-only): mark upload as featured
          var featLbl = document.createElement('label');
          featLbl.style.marginLeft = '8px';
          var featCb = document.createElement('input');
          featCb.type = 'checkbox';
          featCb.checked = !!it.featured;
          featCb.addEventListener('change', function () {
            it.featured = featCb.checked;
            var tx2 = db.transaction([uploadsStore], 'readwrite');
            tx2.objectStore(uploadsStore).put(it).onsuccess = function () {
              renderAdminUploads();
              renderHomeFeatured();
              showToast('Featured flag updated');
            };
          });
          featLbl.appendChild(featCb);
          featLbl.appendChild(document.createTextNode(' Featured'));
          actions.appendChild(featLbl);
          el.appendChild(actions);
          container.appendChild(el);
        });
      });
    }

    function renderAdminContacts() {
      var container = document.getElementById("admin-contacts");
      if (!container) return;
      getAllFromStore(contactsStore).then(function (items) {
        container.innerHTML = "";
        items.sort(function (a, b) {
          return b.time - a.time;
        });
        items.forEach(function (it) {
          var el = document.createElement("div");
          el.className = "upload-item";
          var info = document.createElement("div");
          info.className = "info";
          var title = document.createElement("div");
          title.textContent =
            (it.name || "Anonymous") + " — " + (it.email || "no-email");
          var date = document.createElement("div");
          date.className = "muted";
          date.textContent = new Date(it.time).toLocaleString();
          info.appendChild(title);
          info.appendChild(date);
          el.appendChild(info);

          var actions = document.createElement("div");
          var view = document.createElement("button");
          view.textContent = "View";
          view.className = "upload-button";
          view.addEventListener("click", function () {
            var details =
              "Message:\n" +
              (it.message || "") +
              "\n\nFiles: " +
              (it.files
                ? it.files
                    .map(function (f) {
                      return f.name;
                    })
                    .join(", ")
                : "none");
            alert(details);
          });
          actions.appendChild(view);

          var del = document.createElement("button");
          del.textContent = "Delete";
          del.className = "upload-button";
          del.addEventListener("click", function () {
            var tx = db.transaction([contactsStore], "readwrite");
            var store = tx.objectStore(contactsStore);
            var r = store.delete(it.id);
            r.onsuccess = function () {
              renderAdminContacts();
            };
          });
          actions.appendChild(del);
          el.appendChild(actions);
          container.appendChild(el);
        });
      });
    }

    renderAdminUploads();
    renderAdminContacts();

    // Admin page auth and site controls wiring
    var adminAuthEl = document.getElementById('admin-auth');
    var adminApp = document.getElementById('admin-app');
    if (adminAuthEl) {
      var passInput = document.getElementById('admin-pass');
      var setBtn = document.getElementById('admin-set-pass');
      var loginBtn = document.getElementById('admin-login');
      var msg = document.getElementById('admin-auth-msg');
      // Admin session persistence keys and inactivity timeout (15 minutes)
      var ADMIN_SESSION_KEY = 'peeksee_admin_logged_in';
      var ADMIN_LAST_ACTIVE_KEY = 'peeksee_admin_last_active';
      var ADMIN_INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes
      var adminInactivityTimer = null;

      function setAdminSession(persist) {
        try {
          localStorage.setItem(ADMIN_SESSION_KEY, '1');
          localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(Date.now()));
        } catch (e) {}
        startAdminInactivityWatcher();
        if (adminAuthEl) adminAuthEl.style.display = 'none';
        if (adminApp) adminApp.style.display = '';
      }

      function clearAdminSession() {
        try {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          localStorage.removeItem(ADMIN_LAST_ACTIVE_KEY);
        } catch (e) {}
        stopAdminInactivityWatcher();
        if (adminAuthEl) adminAuthEl.style.display = '';
        if (adminApp) adminApp.style.display = 'none';
      }

      function isAdminSessionActive() {
        try {
          var v = localStorage.getItem(ADMIN_SESSION_KEY);
          if (!v) return false;
          var last = Number(localStorage.getItem(ADMIN_LAST_ACTIVE_KEY) || '0');
          if (!last) return false;
          return Date.now() - last < ADMIN_INACTIVITY_MS;
        } catch (e) {
          return false;
        }
      }

      function refreshAdminLastActive() {
        try { localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(Date.now())); } catch (e) {}
      }

      function startAdminInactivityWatcher() {
        stopAdminInactivityWatcher();
        adminInactivityTimer = setInterval(function () {
          try {
            var last = Number(localStorage.getItem(ADMIN_LAST_ACTIVE_KEY) || '0');
            if (!last) return;
            if (Date.now() - last >= ADMIN_INACTIVITY_MS) {
              // session expired
              clearAdminSession();
              showToast('Admin session expired due to inactivity');
            }
          } catch (e) {}
        }, 1000 * 30); // check every 30s
      }

      function stopAdminInactivityWatcher() { if (adminInactivityTimer) { clearInterval(adminInactivityTimer); adminInactivityTimer = null; } }

      // Wire global activity listeners to refresh last-active timestamp while admin is logged in
      ['click','mousemove','keydown','touchstart'].forEach(function(evt){
        document.addEventListener(evt, function(){ if (localStorage.getItem(ADMIN_SESSION_KEY)) refreshAdminLastActive(); });
      });
      setBtn && setBtn.addEventListener('click', function () {
        var pass = passInput && passInput.value || '';
        if (!pass) { msg.textContent = 'Enter a passphrase first'; return; }
        adminSetPassphrase(pass).then(function () { msg.textContent = 'Passphrase set. You may now login.'; passInput.value = ''; });
      });

      // Try server-side admin login first if the server expects a token: user can paste the server ADMIN_TOKEN here
      loginBtn && loginBtn.addEventListener('click', function () {
        var pass = passInput && passInput.value || '';
        if (!pass) { msg.textContent = 'Enter a passphrase or server admin token to login'; return; }
        // Attempt server login
        fetch('/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pass }) })
          .then(function (r) {
            if (r.ok) return r.json().then(function () { return { server: true }; });
            // if server rejected, try local passphrase
            return adminCheckPassphrase(pass).then(function (ok) {
              return { server: false, ok: ok };
            });
          })
          .then(function (resObj) {
            if (resObj && resObj.server) {
              // server login successful; hide auth overlay
              setAdminSession(true);
              msg.textContent = '';
              showToast('Logged in with server admin token');
            } else if (resObj && resObj.ok) {
              setAdminSession(true);
              msg.textContent = '';
              showToast('Logged in with local passphrase');
            } else {
              msg.textContent = 'Invalid passphrase or server token';
            }
          })
          .catch(function () {
            // on network/server error, fall back to local passphrase check
            adminCheckPassphrase(pass).then(function (ok) {
              if (ok) {
                setAdminSession(true);
                msg.textContent = '';
                showToast('Logged in with local passphrase (server unreachable)');
              } else {
                msg.textContent = 'Invalid passphrase and server login failed';
              }
            });
          });
      });
      // update per-upload fee status indicator
      var feeBtn = document.getElementById('toggle-per-upload-fee');
      var feeStatus = document.getElementById('per-upload-fee-status');
      function refreshFeeStatus() {
        if (feeStatus) feeStatus.textContent = isPerUploadFeeEnabled() ? 'Enabled' : 'Disabled';
      }
      refreshFeeStatus();
      if (feeBtn) feeBtn.addEventListener('click', function () {
        var next = !isPerUploadFeeEnabled();
        setPerUploadFeeEnabled(next);
        refreshFeeStatus();
        showToast('Per-upload fee ' + (next ? 'enabled' : 'disabled'));
      });
      // admin logout button (server-side session logout)
      var logoutBtn = document.getElementById('admin-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          fetch('/admin-logout', { method: 'POST' }).then(function () {
            clearAdminSession();
            showToast('Logged out');
          }).catch(function () {
            clearAdminSession();
            showToast('Logged out (local)');
          });
        });
      }
    }

    // On load, if admin session stored and still active, restore UI
    try {
      if (isAdminSessionActive()) {
        // show admin app
        var adminAuthElLoad = document.getElementById('admin-auth');
        var adminAppLoad = document.getElementById('admin-app');
        if (adminAuthElLoad) adminAuthElLoad.style.display = 'none';
        if (adminAppLoad) adminAppLoad.style.display = '';
        startAdminInactivityWatcher();
      }
    } catch (e) {}

    function renderAdminPayments() {
      var container = document.getElementById("admin-payments");
      if (!container) return;
      fetch("/payments")
        .then(function (r) {
          return r.json();
        })
        .then(function (items) {
          container.innerHTML = "";
          items.sort(function (a, b) {
            return b.time - a.time;
          });
          items.forEach(function (it) {
            var el = document.createElement("div");
            el.className = "upload-item";
            var info = document.createElement("div");
            info.className = "info";
            var title = document.createElement("div");
            title.textContent =
              it.id + " — " + (it.customer_email || "no-email");
            var date = document.createElement("div");
            date.className = "muted";
            date.textContent = new Date(it.time).toLocaleString();
            info.appendChild(title);
            info.appendChild(date);
            el.appendChild(info);

            var actions = document.createElement("div");
            var view = document.createElement("button");
            view.textContent = "View";
            view.className = "upload-button";
            view.addEventListener("click", function () {
              alert(JSON.stringify(it, null, 2));
            });
            actions.appendChild(view);

            el.appendChild(actions);
            container.appendChild(el);
          });
        })
        .catch(function (err) {
          container.innerHTML =
            '<div class="muted">Failed to load payments</div>';
        });
    }

    renderAdminPayments();

    // Admin creators UI
    function renderAdminCreators() {
      var container = document.getElementById("admin-creators");
      if (!container) return;
      listCreators().then(function (items) {
        container.innerHTML = "";
        items.forEach(function (it) {
          var el = document.createElement("div");
          el.className = "upload-item";
          var info = document.createElement("div");
          info.className = "info";
          var title = document.createElement("div");
          title.textContent = it.name || "Creator " + it.id;
          var bio = document.createElement("div");
          bio.className = "muted";
          bio.textContent = it.bio || "";
          info.appendChild(title);
          info.appendChild(bio);
          el.appendChild(info);

          var actions = document.createElement("div");
          var feat = document.createElement("label");
          feat.style.marginRight = "8px";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!it.featured;
          cb.addEventListener("change", function () {
            it.featured = cb.checked;
            var tx = db.transaction([creatorsStore], "readwrite");
            tx.objectStore(creatorsStore).put(it).onsuccess = function () {
              renderAdminCreators();
              showToast("Featured updated");
              renderHomeFeatured();
            };
          });
          feat.appendChild(cb);
          feat.appendChild(document.createTextNode(" Featured"));
          actions.appendChild(feat);
          var del = document.createElement("button");
          del.textContent = "Delete";
          del.className = "upload-button";
          del.addEventListener("click", function () {
            if (!confirm("Delete creator?")) return;
            deleteCreator(it.id).then(function () {
              renderAdminCreators();
              populateCreatorSelects();
              showToast("Creator deleted");
            });
          });
          actions.appendChild(del);
          el.appendChild(actions);
          container.appendChild(el);
        });
      });
    }

    var addCreatorBtn = document.getElementById("add-creator");
    if (addCreatorBtn) {
      addCreatorBtn.addEventListener("click", function () {
        var name = document.getElementById("new-creator-name").value.trim();
        var bio = document.getElementById("new-creator-bio").value.trim();
        if (!name) return;
        addCreator({ name: name, bio: bio, featured: false }).then(function () {
          document.getElementById("new-creator-name").value = "";
          document.getElementById("new-creator-bio").value = "";
          renderAdminCreators();
          populateCreatorSelects();
          showToast("Creator added");
        });
      });
    }

    renderAdminCreators();

    // Carousel: show up to 5 featured creators
    function renderFeaturedCarousel() {
      var container = document.getElementById("carousel-container");
      if (!container) return;
      listCreators().then(function (creators) {
        var featured = creators
          .filter(function (c) {
            return c.featured;
          })
          .slice(0, 5);
        container.innerHTML = "";
        if (!featured.length) {
          container.innerHTML =
            '<div class="muted">No featured creators yet.</div>';
          return;
        }
        featured.forEach(function (c, idx) {
          var slide = document.createElement("div");
          slide.className = "carousel-slide";
          var left = document.createElement("div");
          left.className = "left";
          var right = document.createElement("div");
          right.className = "right";
          left.innerHTML =
            "<h4>" +
            (c.name || "") +
            '</h4><div class="muted">' +
            (c.bio || "") +
            "</div>";
          // show sample creations for this creator
          getAllFromStore(uploadsStore).then(function (items) {
            var samples = items
              .filter(function (it) {
                return it.creatorId == c.id;
              })
              .slice(0, 3);
            if (samples.length) {
              var scont = document.createElement("div");
              scont.style.display = "flex";
              scont.style.gap = "8px";
              samples.forEach(function (s) {
                var src = s.blob ? URL.createObjectURL(s.blob) : s.url || null;
                if (src && s.type && s.type.indexOf("image/") === 0) {
                  var img = document.createElement("img");
                  img.src = src;
                  img.style.maxWidth = "80px";
                  scont.appendChild(img);
                } else if (src && s.type && s.type.indexOf("video/") === 0) {
                  var v = document.createElement("video");
                  v.src = src;
                  v.controls = false;
                  v.width = 120;
                  scont.appendChild(v);
                } else if (src) {
                  // for non-previewable sample types we do not provide a download link to users
                  var a = document.createElement("div");
                  a.textContent = s.name || "file";
                  a.style.maxWidth = "80px";
                  scont.appendChild(a);
                }
              });
              left.appendChild(scont);
            }
          });
          right.innerHTML =
            '<div class="hero-card">Spotlight media or bio</div>';
          slide.appendChild(left);
          slide.appendChild(right);
          container.appendChild(slide);
        });

        // rotate
        var slides = Array.from(container.children);
        var cur = 0;
        if (slides.length) slides[0].classList.add("visible");
        setInterval(function () {
          slides[cur].classList.remove("visible");
          cur = (cur + 1) % slides.length;
          slides[cur].classList.add("visible");
        }, 6000);
      });
    }

    renderFeaturedCarousel();

    // Floating debug button to run self-test and list uploads (development aid)
    try {
      var dbg = document.createElement('button');
      dbg.id = 'peeksee-debug-btn';
      dbg.textContent = 'Run Peeksee Debug';
      dbg.style.position = 'fixed';
      dbg.style.right = '12px';
      dbg.style.bottom = '12px';
      dbg.style.zIndex = 9999;
      dbg.className = 'upload-button';
      dbg.addEventListener('click', function () {
        console.log('peeksee: debug button clicked');
        if (window.peekseeSelfTestUploads) window.peekseeSelfTestUploads();
        setTimeout(function () { if (window.peekseeListUploads) window.peekseeListUploads(); }, 800);
      });
      document.body.appendChild(dbg);
    } catch (e) {}

    var expPaymentsBtn = document.getElementById("export-payments");
    if (expPaymentsBtn) {
      expPaymentsBtn.addEventListener("click", function () {
        fetch("/payments")
          .then(function (r) {
            return r.json();
          })
          .then(function (items) {
            var blob = new Blob([JSON.stringify(items, null, 2)], {
              type: "application/json",
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "payments.json";
            a.click();
            showToast("Payments exported");
          })
          .catch(function (err) {
            showToast("Failed to export payments");
          });
      });
    }

    var clearPaymentsBtn = document.getElementById("clear-payments");
    if (clearPaymentsBtn) {
      clearPaymentsBtn.addEventListener("click", function () {
        if (!confirm("Delete all payments?")) return;
        fetch("/payments", { method: "DELETE" })
          .then(function () {
            renderAdminPayments();
            showToast("Payments cleared");
          })
          .catch(function () {
            showToast("Failed to clear payments");
          });
      });
    }

    var expUploadsBtn = document.getElementById("export-uploads");
    if (expUploadsBtn) {
      expUploadsBtn.addEventListener("click", function () {
        getAllFromStore(uploadsStore)
          .then(function (items) {
            exportUploadsAsZip(items)
              .then(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = "uploads.zip";
                a.click();
                showToast("Exports ready for download");
              })
              .catch(function (err) {
                showToast("Export failed: " + (err && err.message));
              });
          })
          .catch(function (err) {
            showToast("Failed to read uploads: " + (err && err.message));
          });
      });
    }

    var expContactsBtn = document.getElementById("export-contacts");
    if (expContactsBtn) {
      expContactsBtn.addEventListener("click", function () {
        getAllFromStore(contactsStore)
          .then(function (items) {
            exportContactsAsJSON(items)
              .then(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = "contacts.json";
                a.click();
                showToast("Contacts exported");
              })
              .catch(function (err) {
                showToast("Export failed: " + (err && err.message));
              });
          })
          .catch(function (err) {
            showToast("Failed to read contacts: " + (err && err.message));
          });
      });
    }

    var clearUploadsBtn = document.getElementById("clear-uploads");
    if (clearUploadsBtn) {
      clearUploadsBtn.addEventListener("click", function () {
        if (!confirm("Delete all uploads?")) return;
        deleteAllFromStore(uploadsStore).then(function () {
          renderAdminUploads();
          renderUploads();
          showToast("All uploads deleted");
        });
      });
    }

    var clearContactsBtn = document.getElementById("clear-contacts");
    if (clearContactsBtn) {
      clearContactsBtn.addEventListener("click", function () {
        if (!confirm("Delete all contacts?")) return;
        deleteAllFromStore(contactsStore).then(function () {
          renderAdminContacts();
          showToast("All contacts deleted");
        });
      });
    }

    // Admin: fetch server-side contacts and show them
    var showServerBtn = document.getElementById("show-server-contacts");
    if (showServerBtn) {
      showServerBtn.addEventListener("click", function () {
        fetch("/contacts")
          .then(function (r) {
            if (!r.ok) throw new Error("Failed");
            return r.json();
          })
          .then(function (items) {
            var container = document.getElementById("admin-contacts");
            if (!container) return;
            container.innerHTML =
              "<h3>Server contacts</h3>" +
              items
                .map(function (it) {
                  return (
                    '<div class="upload-item"><div class="info"><div>' +
                    (it.name || "") +
                    " — " +
                    (it.email || "") +
                    '</div><div class="muted">' +
                    new Date(it.time).toLocaleString() +
                    "</div></div><div>" +
                    (it.message || "") +
                    "</div></div>"
                  );
                })
                .join("");
          })
          .catch(function (err) {
            showToast("Failed to load server contacts");
          });
      });
    }

    // Admin: sync local contacts to server
    var syncBtn = document.getElementById("sync-contacts-to-server");
    if (syncBtn) {
      syncBtn.addEventListener("click", function () {
        if (
          !confirm(
            "Sync local contacts to server? This will POST each local record to /contacts."
          )
        )
          return;
        getAllFromStore(contactsStore).then(function (items) {
          if (!items || !items.length) {
            showToast("No local contacts to sync");
            return;
          }
          var chain = Promise.resolve();
          var success = 0,
            failed = 0;
          items.forEach(function (it) {
            chain = chain.then(function () {
              return fetch("/contacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(it),
              })
                .then(function (r) {
                  if (!r.ok) throw new Error("server");
                  success++;
                })
                .catch(function () {
                  failed++;
                });
            });
          });
          chain.then(function () {
            showToast(
              "Sync complete: " + success + " OK, " + failed + " failed"
            );
          });
        });
      });
    }

    var fileInput = document.getElementById("file-input");
    if (fileInput) {
      fileInput.addEventListener("change", function (e) {
        var ownership = document.getElementById("ownership-confirm");
        if (ownership && !ownership.checked) {
          showToast(
            "Please confirm you have rights to upload before continuing"
          );
          fileInput.value = "";
          return;
        }
        var files = Array.from(e.target.files || []);
        var newName = (
          document.getElementById("upload-creator-new") || { value: "" }
        ).value.trim();
        var sel = document.getElementById("upload-creator");
        var selectedId = sel ? sel.value || null : null;
        ensureChargeForUpload()
          .then(function () {
            return findOrCreateCreatorByName(newName);
          })
          .then(function (maybeId) {
            var creatorId = maybeId || (selectedId ? Number(selectedId) : null);
            var chain = Promise.resolve();
            files.forEach(function (f) {
              chain = chain.then(function () {
                var deletableUntil =
                  Date.now() + TEMP_DELETE_MINUTES * 60 * 1000;
                return ensureDBReady()
                  .then(function () {
                    return addFile(
                      f.name,
                      f.type,
                      f,
                      creatorId,
                      clientId,
                      deletableUntil
                    );
                  })
                  .catch(function (err) {
                    console.error('addFile failed for', f.name, err);
                    showToast('Failed to save ' + f.name + ': ' + (err && err.message));
                    return Promise.reject(err);
                  });
              });
            });
            return chain;
          })
          .then(function () {
            renderUploads();
            renderHomeFeatured();
            renderCreatorsPage();
            renderTitlesPage();
            showToast("Upload complete");
          })
          .catch(function (err) {
            if (err && err.message === "Redirecting to Checkout") {
              // user is being taken to checkout; do nothing further
            } else {
              console.error('Upload flow failed', err);
              showToast("Upload failed: " + (err && err.message));
            }
          });
        fileInput.value = "";
      });
    }

    var drop = document.getElementById("drop-area");
    if (drop) {
      drop.addEventListener("dragover", function (e) {
        e.preventDefault();
        drop.classList.add("drag");
      });
      drop.addEventListener("dragleave", function () {
        drop.classList.remove("drag");
      });
      drop.addEventListener("drop", function (e) {
        e.preventDefault();
        drop.classList.remove("drag");
        var ownership = document.getElementById("ownership-confirm");
        if (ownership && !ownership.checked) {
          showToast(
            "Please confirm you have rights to upload before continuing"
          );
          return;
        }
        var files = Array.from(e.dataTransfer.files || []);
        var newName = (
          document.getElementById("upload-creator-new") || { value: "" }
        ).value.trim();
        var sel = document.getElementById("upload-creator");
        var selectedId = sel ? sel.value || null : null;
        ensureChargeForUpload()
          .then(function () {
            return findOrCreateCreatorByName(newName);
          })
          .then(function (maybeId) {
            var creatorId = maybeId || (selectedId ? Number(selectedId) : null);
            var chain = Promise.resolve();
            files.forEach(function (f) {
              chain = chain.then(function () {
                var deletableUntil =
                  Date.now() + TEMP_DELETE_MINUTES * 60 * 1000;
                return ensureDBReady()
                  .then(function () {
                    return addFile(
                      f.name,
                      f.type,
                      f,
                      creatorId,
                      clientId,
                      deletableUntil
                    );
                  })
                  .catch(function (err) {
                    console.error('addFile failed for', f.name, err);
                    showToast('Failed to save ' + f.name + ': ' + (err && err.message));
                    return Promise.reject(err);
                  });
              });
            });
            return chain;
          })
          .then(function () {
            renderUploads();
            renderHomeFeatured();
            renderCreatorsPage();
            renderTitlesPage();
            showToast("Upload complete");
          })
          .catch(function (err) {
            if (err && err.message === "Redirecting to Checkout") {
              // user was redirected for payment; do nothing
            } else {
              console.error(err);
              showToast("Upload failed: " + (err && err.message));
            }
          });
      });
    }

    // Recording support
    var audioBtn = document.getElementById("record-audio");
    var videoBtn = document.getElementById("record-video");
    var recorder,
      recordedChunks = [],
      mediaStream;

    function startRecording(kind) {
      var constraints =
        kind === "video" ? { audio: true, video: true } : { audio: true };
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
          mediaStream = stream;
          recorder = new MediaRecorder(stream);
          recordedChunks = [];
          recorder.ondataavailable = function (e) {
            if (e.data && e.data.size) recordedChunks.push(e.data);
          };
          recorder.onstop = function () {
            var blob = new Blob(recordedChunks, {
              type: recorder.mimeType || "video/webm",
            });
            var name =
              kind === "video"
                ? "recording-" + Date.now() + ".webm"
                : "audio-" + Date.now() + ".webm";
            var ownership = document.getElementById("ownership-confirm");
            if (ownership && !ownership.checked) {
              showToast(
                "Please confirm you have rights to upload before recording"
              );
              mediaStream.getTracks().forEach((t) => t.stop());
              return;
            }
            var newName = (
              document.getElementById("upload-creator-new") || { value: "" }
            ).value.trim();
            var sel = document.getElementById("upload-creator");
            var selectedId = sel ? sel.value || null : null;
            // Ensure charge (if required) before saving recording
            ensureChargeForUpload()
              .then(function () {
                return findOrCreateCreatorByName(newName);
              })
              .then(function (maybeId) {
                var creatorId =
                  maybeId || (selectedId ? Number(selectedId) : null);
                var deletableUntil =
                  Date.now() + TEMP_DELETE_MINUTES * 60 * 1000;
                return addFile(
                  name,
                  blob.type,
                  blob,
                  creatorId,
                  clientId,
                  deletableUntil
                );
              })
              .then(function () {
                renderUploads();
                renderHomeFeatured();
                renderCreatorsPage();
                renderTitlesPage();
                showToast("Recording saved");
              })
              .catch(function (err) {
                if (err && err.message === "Redirecting to Checkout") {
                  // user is being redirected to checkout; do nothing further
                } else {
                  console.error(err);
                  showToast("Recording failed: " + (err && err.message));
                }
              })
              .finally(function () {
                try {
                  mediaStream.getTracks().forEach((t) => t.stop());
                } catch (e) {}
              });
          };
          recorder.start();
        })
        .catch(function (err) {
          alert("Recording failed: " + err.message);
        });
    }

    function stopRecording() {
      if (recorder && recorder.state === "recording") recorder.stop();
    }

    if (audioBtn) {
      audioBtn.addEventListener("click", function () {
        if (recorder && recorder.state === "recording") {
          stopRecording();
          audioBtn.textContent = "Start Audio Recording";
        } else {
          startRecording("audio");
          audioBtn.textContent = "Stop Audio Recording";
        }
      });
    }

    if (videoBtn) {
      videoBtn.addEventListener("click", function () {
        if (recorder && recorder.state === "recording") {
          stopRecording();
          videoBtn.textContent = "Start Video Recording";
        } else {
          startRecording("video");
          videoBtn.textContent = "Stop Video Recording";
        }
      });
    }

    // Contact form handling (store contact submissions in contacts store)
    var contactForm = document.getElementById("contact-form");
    if (contactForm) {
      contactForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var status = document.getElementById("contact-status");
        status.textContent = "";
        var name = document.getElementById("name").value.trim();
        var email = document.getElementById("email").value.trim();
        var subject = document.getElementById("subject").value.trim();
        var message = document.getElementById("message").value.trim();
        var filesInput = document.getElementById("contact-files");
        var filePurpose = document.getElementById("file-purpose").value.trim();
        var consent = document.getElementById("consent").checked;

        var attached = filesInput ? Array.from(filesInput.files) : [];
        var creatorSel = document.getElementById("contact-creator");
        var creatorId = creatorSel ? creatorSel.value || null : null;
        if (attached.length && (!filePurpose || !consent)) {
          status.textContent =
            "Please provide the file purpose and confirm consent before submitting.";
          return;
        }

        // convert attached files to blobs to store inside contact record
        var record = {
          name: name,
          email: email,
          subject: subject,
          message: message,
          time: Date.now(),
          files: [],
        };

        var p = Promise.resolve();
        attached.forEach(function (f) {
          p = p.then(function () {
            return new Promise(function (res) {
              var reader = new FileReader();
              reader.onload = function () {
                var blob = new Blob([reader.result], { type: f.type });
                record.files.push({ name: f.name, type: f.type, blob: blob });
                res();
              };
              reader.readAsArrayBuffer(f);
            });
          });
        });

        p.then(function () {
          if (filePurpose) record.filePurpose = filePurpose;
          record.consent = !!consent;
          if (creatorId) record.creatorId = creatorId;
          // Try sending to server first; fall back to local store on failure
          fetch("/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record),
          })
            .then(function (resp) {
              if (!resp.ok) throw new Error("Server error");
              status.textContent = "Message sent to server. Thank you!";
              contactForm.reset();
            })
            .catch(function () {
              // network failure or server error - save locally
              addContact(record)
                .then(function () {
                  status.textContent = "Submission saved locally. Thank you!";
                  contactForm.reset();
                })
                .catch(function (err) {
                  status.textContent =
                    "Failed to save submission: " + err.message;
                });
            });
        });
      });
    }

    // Initialize creator selects on docs and contact pages
    function populateCreatorSelects() {
      listCreators().then(function (creators) {
        var uploadSel = document.getElementById("upload-creator");
        var contactSel = document.getElementById("contact-creator");
        if (uploadSel) {
          uploadSel.innerHTML =
            '<option value="">(none)</option>' +
            creators
              .map(function (c) {
                return (
                  '<option value="' +
                  c.id +
                  '">' +
                  (c.name || c.id) +
                  "</option>"
                );
              })
              .join("");
        }
        if (contactSel) {
          contactSel.innerHTML =
            '<option value="">(none)</option>' +
            creators
              .map(function (c) {
                return (
                  '<option value="' +
                  c.id +
                  '">' +
                  (c.name || c.id) +
                  "</option>"
                );
              })
              .join("");
        }
      });
      // add handlers for quick-add buttons
      var upAdd = document.getElementById("upload-creator-add");
      if (upAdd)
        upAdd.addEventListener("click", function () {
          var name = document.getElementById("upload-creator-new").value.trim();
          if (!name) return;
          addCreator({ name: name, bio: "" }).then(function () {
            document.getElementById("upload-creator-new").value = "";
            populateCreatorSelects();
            showToast("Creator added");
          });
        });
      var ctAdd = document.getElementById("contact-creator-add");
      if (ctAdd)
        ctAdd.addEventListener("click", function () {
          var name = document
            .getElementById("contact-creator-new")
            .value.trim();
          if (!name) return;
          addCreator({ name: name, bio: "" }).then(function () {
            document.getElementById("contact-creator-new").value = "";
            populateCreatorSelects();
            showToast("Creator added");
          });
        });
    }

    populateCreatorSelects();

    // Utility: find existing creator by name (case-insensitive) or create one
    function findOrCreateCreatorByName(name) {
      name = (name || "").trim();
      if (!name) return Promise.resolve(null);
      return listCreators().then(function (creators) {
        var found = creators.find(function (c) {
          return (c.name || "").toLowerCase() === name.toLowerCase();
        });
        if (found) return found.id;
        return addCreator({ name: name, bio: "", featured: false }).then(
          function (newId) {
            // small feedback: show toast and highlight entry in creators list (if present)
            showToast("Creator added: " + name);
            // render creators page and briefly mark the new entry
            renderCreatorsPage();
            setTimeout(function () {
              var ol = document.getElementById("creators-ol");
              if (!ol) return;
              var links = ol.querySelectorAll("a");
              for (var i = 0; i < links.length; i++) {
                var href = links[i].getAttribute("href") || "";
                if (href.indexOf("id=" + encodeURIComponent(newId)) !== -1) {
                  links[i].classList.add("creator-highlight");
                  setTimeout(
                    function (el) {
                      el.classList.remove("creator-highlight");
                    }.bind(null, links[i]),
                    2000
                  );
                  break;
                }
              }
            }, 200);
            return newId;
          }
        );
      });
    }

    // Render the creators page (numbered list)
    function renderCreatorsPage() {
      var ol = document.getElementById("creators-ol");
      if (!ol) return;
      listCreators().then(function (creators) {
        ol.innerHTML = "";
        creators.sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        });
        creators.forEach(function (c) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = "creator.html?id=" + encodeURIComponent(c.id);
          a.textContent = c.name || "Creator " + c.id;
          li.appendChild(a);
          ol.appendChild(li);
        });
      });
    }

    // Render titles listing page
    function renderTitlesPage() {
      var ol = document.getElementById("titles-ol");
      if (!ol) return;
      listFiles().then(function (items) {
        ol.innerHTML = "";
        items.sort(function (a, b) {
          return b.time - a.time;
        });
        items.forEach(function (it) {
          var li = document.createElement("li");
          if (it.creatorId) {
            var a = document.createElement("a");
            a.href = "creator.html?id=" + encodeURIComponent(it.creatorId);
            a.textContent = it.name || "Item " + it.id;
            li.appendChild(a);
          } else {
            li.textContent = it.name || "Item " + it.id;
          }
          ol.appendChild(li);
        });
      });
    }

    // Render an individual creator profile page (creator.html?id=...)
    function renderCreatorProfile() {
      var profile = document.getElementById("creator-profile");
      if (!profile) return;
      // simple query parser
      var params = new URLSearchParams(location.search);
      var id = params.get("id");
      if (!id) {
        profile.innerHTML = '<div class="muted">No creator specified.</div>';
        return;
      }
      getCreator(Number(id)).then(function (c) {
        if (!c) {
          profile.innerHTML = '<div class="muted">Creator not found.</div>';
          return;
        }
        var nameEl = document.getElementById("creator-name");
        var bioEl = document.getElementById("creator-bio");
        nameEl.textContent = c.name || "Creator " + c.id;
        bioEl.textContent = c.bio || "";
        // make bio editable
        bioEl.setAttribute("contenteditable", "true");
        bioEl.style.minHeight = "60px";
        bioEl.style.background = "#fff";
        bioEl.style.padding = "8px";
        bioEl.style.borderRadius = "6px";
        // save handler
        var saveBio = function () {
          c.bio = bioEl.textContent.trim();
          var tx = db.transaction([creatorsStore], "readwrite");
          tx.objectStore(creatorsStore).put(c).onsuccess = function () {
            showToast("Bio saved");
            renderCreatorsPage();
          };
        };
        // create a small save button
        var existing = document.getElementById("save-creator-bio");
        if (!existing) {
          var btn = document.createElement("button");
          btn.id = "save-creator-bio";
          btn.textContent = "Save Bio";
          btn.className = "upload-button";
          btn.addEventListener("click", saveBio);
          profile.insertBefore(
            btn,
            document.getElementById("creator-creations")
          );
        }

        // show creations for this creator
        listFiles().then(function (items) {
          var cont = document.getElementById("creator-creations");
          cont.innerHTML = "";
          items
            .filter(function (it) {
              return it.creatorId == c.id;
            })
            .sort(function (a, b) {
              return b.time - a.time;
            })
            .forEach(function (it) {
              var card = document.createElement("div");
              card.className = "creation-card";
              var src = it.blob ? URL.createObjectURL(it.blob) : it.url || null;
              if (src && it.type && it.type.indexOf("image/") === 0) {
                var img = document.createElement("img");
                img.src = src;
                card.appendChild(img);
              } else if (src && it.type && it.type.indexOf("video/") === 0) {
                var v = document.createElement("video");
                v.src = src;
                v.controls = true;
                card.appendChild(v);
              } else if (src && it.type && it.type.indexOf("audio/") === 0) {
                var a = document.createElement("audio");
                a.src = src;
                a.controls = true;
                card.appendChild(a);
              }
              var title = document.createElement("div");
              title.className = "title";
              title.textContent = it.name || "Item " + it.id;
              card.appendChild(title);
              cont.appendChild(card);
            });
        });

        // wire feedback buttons
        var love = document.getElementById("fb-love");
        var hate = document.getElementById("fb-hate");
        var donate = document.getElementById("fb-donate");
        if (love)
          love.addEventListener("click", function () {
            var name = document.getElementById("fb-name").value.trim();
            var email = document.getElementById("fb-email").value.trim();
            var msg = document.getElementById("fb-message").value.trim();
            addContact({
              name: name || "Anonymous",
              email: email || "",
              subject: "Love",
              message: msg || "Sent love",
              time: Date.now(),
              feedbackType: "love",
              targetCreatorId: c.id,
            }).then(function () {
              showToast("Love saved — creator notified (locally)");
              document.getElementById("creator-feedback").reset();
            });
          });
        if (hate)
          hate.addEventListener("click", function () {
            var name = document.getElementById("fb-name").value.trim();
            var email = document.getElementById("fb-email").value.trim();
            var msg = document.getElementById("fb-message").value.trim();
            addContact({
              name: name || "Anonymous",
              email: email || "",
              subject: "Hate",
              message: msg || "Sent hate",
              time: Date.now(),
              feedbackType: "hate",
              targetCreatorId: c.id,
            }).then(function () {
              showToast("Hate saved — creator notified (locally)");
              document.getElementById("creator-feedback").reset();
            });
          });
        if (donate)
          donate.addEventListener("click", function () {
            // Attempt a Checkout session; server must support create-checkout-session for this to work
            fetch("/create-checkout-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                priceId: "replace_with_price_id",
                creatorId: c.id,
              }),
            })
              .then(function (r) {
                if (!r.ok) throw new Error("Server error");
                return r.json();
              })
              .then(function (json) {
                if (json && json.id) {
                  if (!window.Stripe) {
                    var s = document.createElement("script");
                    s.src = "https://js.stripe.com/v3/";
                    s.onload = function () {
                      var stripe = Stripe(json.publicKey || "");
                      stripe.redirectToCheckout({ sessionId: json.id });
                    };
                    document.head.appendChild(s);
                  } else {
                    var stripe = Stripe(json.publicKey || "");
                    stripe.redirectToCheckout({ sessionId: json.id });
                  }
                } else {
                  throw new Error("Invalid server response");
                }
              })
              .catch(function (err) {
                alert(
                  "Donate flow not configured or failed: " +
                    (err && err.message)
                );
              });
          });
      });
    }

    // Diagnostics helper: render raw uploads into #diagnostics or console
    window.peekseeDiagnostics = function () {
      getAllFromStore(uploadsStore)
        .then(function (items) {
          if (!items) return console.log("No uploads");
          var el = document.getElementById("diagnostics");
          if (!el) return console.log(items);
          el.innerHTML =
            "<pre>" +
            JSON.stringify(
              items.map(function (it) {
                return {
                  id: it.id,
                  name: it.name,
                  type: it.type,
                  hasBlob: !!it.blob,
                  url: it.url,
                  creatorId: it.creatorId,
                };
              }),
              null,
              2
            ) +
            "</pre>";
        })
        .catch(function (e) {
          console.error("Diagnostics failed", e);
        });
    };

    // initial page-specific renders
    renderCreatorsPage();
    renderTitlesPage();
    renderCreatorProfile();
    // Theme handling: persist user choice and apply light/dark class on body
    var THEME_KEY = "peeksee_theme_light";
    function isLightTheme() {
      return localStorage.getItem(THEME_KEY) === "1";
    }
    function applyTheme() {
      if (isLightTheme()) document.body.classList.add("light");
      else document.body.classList.remove("light");
      var btn = document.getElementById("theme-toggle");
      if (btn) btn.textContent = isLightTheme() ? "Dark" : "Light";
    }
    var themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.addEventListener("click", function () {
        var cur = isLightTheme();
        localStorage.setItem(THEME_KEY, cur ? "0" : "1");
        applyTheme();
      });
    }
    applyTheme();
  });
})();

/* ----- Payments: client-side helpers ----- */
(function () {
  // NOTE: Stripe Checkout requires a server to create Checkout Sessions using your secret key.
  // This client helper calls POST /create-checkout-session and expects a JSON response { id: 'cs_...' }
  // The server must return a Checkout Session ID created with the Stripe secret key. See README for sample server.

  var stripeBtn = document.getElementById("stripe-checkout");
  if (!stripeBtn) return;

  stripeBtn.addEventListener("click", function () {
    showToast("Initializing payment...");
    // call local endpoint - this will fail on file://; run via a server and provide an endpoint
    fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId: "replace_with_price_id" }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Server error: " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json && json.id) {
          // redirect to Checkout
          // load Stripe.js lazily
          if (!window.Stripe) {
            var s = document.createElement("script");
            s.src = "https://js.stripe.com/v3/";
            s.onload = function () {
              var stripe = Stripe(json.publicKey || "");
              stripe
                .redirectToCheckout({ sessionId: json.id })
                .then(function (r) {
                  if (r && r.error) showToast(r.error.message);
                });
            };
            document.head.appendChild(s);
          } else {
            var stripe = Stripe(json.publicKey || "");
            stripe
              .redirectToCheckout({ sessionId: json.id })
              .then(function (r) {
                if (r && r.error) showToast(r.error.message);
              });
          }
        } else {
          throw new Error("Invalid server response");
        }
      })
      .catch(function (err) {
        console.error(err);
        alert(
          "Stripe Checkout is not configured. See README for server setup."
        );
      });
  });
})();
