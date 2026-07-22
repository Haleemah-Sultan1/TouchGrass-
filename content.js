console.log("TouchGrass GCR content script loaded");

function scrapeAssignments() {
  // GCR assignment titles usually sit in elements with role="link" or specific classes
  // this selector WILL need tweaking once you inspect the actual page
  const items = document.querySelectorAll('[data-stream-item-id]');
  const assignments = [];

  items.forEach(item => {
    const title = item.querySelector('span')?.innerText || "Untitled";
    assignments.push({ title, scrapedAt: Date.now() });
  });

  chrome.storage.local.set({ assignments });
  console.log("Scraped:", assignments);
}

scrapeAssignments();
