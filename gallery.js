/* The Demo Gallery — renders VIDEOS (from videos.js) as framed artworks. */
(function () {
  "use strict";

  var ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
  var FALLBACK_TITLE = "Untitled Work";

  // --- Video ID parsing -----------------------------------------------------

  function extractVideoId(url) {
    if (typeof url !== "string") return null;
    var input = url.trim();
    if (ID_PATTERN.test(input)) return input;

    var parsed;
    try {
      parsed = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input);
    } catch (e) {
      return null;
    }

    var host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    var candidate = null;

    if (host === "youtu.be") {
      candidate = parsed.pathname.split("/")[1] || null;
    } else if (host === "youtube.com" || host === "m.youtube.com" ||
               host === "youtube-nocookie.com") {
      var segments = parsed.pathname.split("/").filter(Boolean);
      if (segments[0] === "watch") {
        candidate = parsed.searchParams.get("v");
      } else if (segments[0] === "shorts" || segments[0] === "embed" ||
                 segments[0] === "live") {
        candidate = segments[1] || null;
      }
    }

    return candidate && ID_PATTERN.test(candidate) ? candidate : null;
  }

  // --- Rendering ------------------------------------------------------------

  function buildArtwork(video, index) {
    var figure = document.createElement("figure");
    figure.className = "artwork";
    figure.style.setProperty("--i", String(index));

    var frame = document.createElement("button");
    frame.className = "artwork-frame";
    frame.type = "button";
    frame.dataset.videoId = video.id;
    frame.setAttribute("aria-label", "Play video: " + video.title);

    var img = document.createElement("img");
    img.className = "artwork-image";
    img.alt = "";
    img.loading = "lazy";
    attachThumbnail(img, figure, video.id);
    frame.appendChild(img);

    var placard = document.createElement("figcaption");
    placard.className = "artwork-placard";

    var title = document.createElement("h2");
    title.className = "artwork-title";
    title.textContent = video.title;

    var caption = document.createElement("p");
    caption.className = "artwork-caption";
    caption.textContent = "Software Demo";

    placard.appendChild(title);
    placard.appendChild(caption);
    figure.appendChild(frame);
    figure.appendChild(placard);
    return figure;
  }

  function attachThumbnail(img, figure, videoId) {
    var triedFallback = false;

    function useFallback() {
      if (triedFallback) {
        // Fallback also failed — reveal the artwork anyway.
        figure.classList.add("is-loaded");
        return;
      }
      triedFallback = true;
      img.src = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
    }

    function onLoad() {
      // maxresdefault may 200 with a 120x90 gray placeholder.
      if (!triedFallback && img.naturalWidth <= 120) {
        useFallback();
        return;
      }
      figure.classList.add("is-loaded");
    }

    img.addEventListener("load", onLoad);
    img.addEventListener("error", useFallback);
    img.src = "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg";

    // Already-cached image may never fire "load".
    if (img.complete && img.naturalWidth > 0) onLoad();
  }

  // --- Titles ---------------------------------------------------------------

  function fetchTitle(video, figure) {
    var endpoint = "https://noembed.com/embed?url=" +
      encodeURIComponent("https://www.youtube.com/watch?v=" + video.id);

    fetch(endpoint)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.error || typeof data.title !== "string" || !data.title) return;
        video.title = data.title;
        figure.querySelector(".artwork-title").textContent = data.title;
        figure.querySelector(".artwork-frame")
          .setAttribute("aria-label", "Play video: " + data.title);
      })
      .catch(function () { /* keep fallback title */ });
  }

  // --- Lightbox -------------------------------------------------------------

  var lightbox = null;
  var playerMount = null;
  var lastTrigger = null;

  function openLightbox(videoId, title, trigger) {
    lastTrigger = trigger;

    var iframe = document.createElement("iframe");
    iframe.src = "https://www.youtube-nocookie.com/embed/" + videoId +
      "?autoplay=1&rel=0";
    iframe.setAttribute("allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    iframe.title = title;

    playerMount.textContent = "";
    playerMount.appendChild(iframe);

    lightbox.hidden = false;
    // Next frame, so the unhide renders first and the fade can transition.
    requestAnimationFrame(function () {
      lightbox.classList.add("is-open");
    });
    document.body.style.overflow = "hidden";

    var closeButton = lightbox.querySelector(".lightbox-close");
    if (closeButton) closeButton.focus();
  }

  function closeLightbox() {
    if (lightbox.hidden) return;
    lightbox.classList.remove("is-open");
    lightbox.hidden = true;
    playerMount.textContent = ""; // removes iframe, stops playback
    document.body.style.overflow = "";
    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  // --- Init -----------------------------------------------------------------

  function normalizeVideos(raw) {
    var videos = [];
    raw.forEach(function (entry) {
      var url = typeof entry === "string" ? entry : (entry && entry.url);
      var id = extractVideoId(url);
      if (!id) {
        console.warn("The Demo Gallery: skipping unparseable video URL:", url);
        return;
      }
      var customTitle = entry && typeof entry === "object" ? entry.title : undefined;
      videos.push({
        id: id,
        title: customTitle || FALLBACK_TITLE,
        hasCustomTitle: Boolean(customTitle)
      });
    });
    return videos;
  }

  function init() {
    var gallery = document.getElementById("gallery");
    var emptyState = document.getElementById("empty-state");
    lightbox = document.getElementById("lightbox");
    playerMount = document.getElementById("player-mount");

    var raw = [];
    if (typeof VIDEOS === "undefined") {
      console.warn("The Demo Gallery: VIDEOS is not defined (expected from videos.js).");
    } else if (Array.isArray(VIDEOS)) {
      raw = VIDEOS;
    } else {
      console.warn("The Demo Gallery: VIDEOS must be an array (check videos.js).");
    }

    var videos = normalizeVideos(raw);

    if (videos.length === 0) {
      if (emptyState) emptyState.hidden = false;
      return;
    }

    videos.forEach(function (video, index) {
      var figure = buildArtwork(video, index);
      gallery.appendChild(figure);
      if (!video.hasCustomTitle) fetchTitle(video, figure);
    });

    // Lightbox wiring: delegate clicks from gallery frames.
    gallery.addEventListener("click", function (event) {
      var frame = event.target.closest(".artwork-frame");
      if (!frame) return;
      var titleEl = frame.parentElement.querySelector(".artwork-title");
      var title = titleEl ? titleEl.textContent : FALLBACK_TITLE;
      openLightbox(frame.dataset.videoId, title, frame);
    });

    lightbox.addEventListener("click", function (event) {
      if (event.target.closest("[data-close]")) closeLightbox();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeLightbox();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
