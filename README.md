# TouchGrass GCR — Setup & Usage

## Installing / Reloading the Extension

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the TouchGrass folder
4. Whenever you pull new code or edit a file yourself, click the **reload icon** on the TouchGrass card in this page — the extension does NOT pick up changes automatically
5. After reloading the extension, also **refresh any already-open Classroom tabs** (a normal page refresh, not just closing the popup) — otherwise you may see "content script not responding" errors

## First-Time Setup Per Class (do this once per class)

Before the teacher filter or pin features can work fully in a class, TouchGrass needs to learn who the teachers are and load the full post history:

1. Open the class → click **People**
2. Scroll down and click **View all** — this loads the complete teacher/student roster into the page, which TouchGrass reads automatically in the background
3. Go back to **Stream** and scroll all the way to the bottom of the page at least once — this forces Google Classroom to lazy-load every post so TouchGrass can see them all (not just the first batch)

You only need to do this once per class, not every time you open the popup.

## Teacher Filter

1. Open the popup on a class's Stream page
2. Pick a teacher from the **Teacher** dropdown
3. Click **Apply Filter** — matching posts get highlighted, with a nav arrow at the bottom-right to jump between them
4. If you've synced the course (see below), the count shown will be the real total from Classroom's data — otherwise it only reflects posts currently loaded on the page

## Dark Mode

Toggle ** Dark Mode (page)** in the popup — this darkens the actual Classroom page you're on (not the popup itself, which is already dark). It applies across all of classroom.google.com, not just inside a class. Takes effect immediately, no reload needed.

## Submission Checker

1. Click **Submission Checker** in the popup — opens a new tab
2. Paste the assignment's instructions text into the box
3. Click **Extract Checklist** — this reads the instructions and builds a checklist of requirements, plus detects any file-naming convention if one is mentioned
4. Check the boxes off manually as you complete each item, OR:
5. Choose your submission files under **Check your file names** — TouchGrass checks each filename against the detected naming convention
6. If a file's name doesn't match, you'll get an editable suggested name and a **Download Renamed Copy** button — this downloads a new copy under the corrected name (your original file is never touched or overwritten)
7. Click **Verify Checklist Against These Files** to have the checklist items auto-checked against your actual file content, each with a ✅ / ❌ / ❓ and a short reason — review these yourself before submitting, since it can be wrong on subjective or unclear items (marked ❓ on purpose when it's not sure)


### Automatic Background Sync

TouchGrass GCR is designed to handle syncing automatically, so students don't have to keep doing it themselves. After the one-time Google account authorization, the extension syncs in the background whenever a Classroom page is opened or the extension popup is accessed. There is no separate "Sync" button. Course information, assignments, submission status, and file attachments are kept up to date automatically. This also includes archived classrooms, so older course data is still available whenever another feature needs it.

### Study Plan & Timetable Generator

The planner has two modes depending on what the student needs. **Timetable mode** creates a schedule based on pending assignments from the student's active courses within a selected date range. It considers the estimated difficulty and time required for each task, the number of hours the student has available each day, and up to three preferred types of work, such as assignments, quizzes, labs, or projects. Longer or harder tasks can also be split into smaller sessions to make them easier to manage.

**Study Plan mode** is mainly for exam preparation. Students can select up to five priority subjects, enter the topics they need to study, and mark topics they find difficult so they get more attention. The schedule is generated using fixed rules rather than AI deciding the actual study timings, giving students a clear day-by-day plan that can also be printed.

### Difficulty & Time Estimation

Each assignment gets a difficulty score from 1–10 along with an estimated completion time. Gemini looks at the actual assignment description and its topic context to make the estimate more relevant instead of relying only on the assignment title.

The numerical score is then converted into a more casual label, ranging from "free real estate" to "absolutely cooked." These labels are generated locally by the extension, so the same difficulty range always gets the same label.

### Topic & Concept Breakdown

For assignments with multiple questions, TouchGrass GCR goes beyond the description shown on Google Classroom. It can also read the actual assignment material, including attached PDFs and Google Docs.

The assignment is broken down question by question. For each question, the extension shows the relevant course topics, the concepts or skills needed to solve it, and its difficulty score. This gives students a better idea of which questions they can start with and which ones might take more effort.

If the topics listed in Google Classroom are only being used for organization and don't actually represent the course content, students can also provide their own topic list.

### Comment Thread Summarization

Important answers can easily get lost in long Classroom comment threads, especially when multiple students are asking similar questions. This feature goes through the full class comment section and groups repeated questions together.

Each unique student query is shown with a short summary of the teacher's response instead of simply copying the original comment. The teacher's name is included for attribution, while questions that haven't received an answer are clearly marked.

### Pin Feature (Announcement Pinning)
Similar to pinning a message in WhatsApp, students can pin any announcement, assignment, or material post directly from the class stream and revisit it instantly from the extension popup. Hovering over a post reveals a **pin button**, and the pinned list stays in sync instantly whether a post is pinned from the page itself or from the popup.

Clicking a pinned post scrolls straight to it instead of making the student search the feed manually. The extension remembers exactly where the post was on the page at the moment it was pinned, so it can jump there almost instantly the next time. If the feed has shifted since then (new posts pushed the original one further down), it automatically keeps scrolling down the page to relocate it, showing a *"Looking for your pinned post…"* message so the movement doesn't feel unexplained. If it still isn't found on the first try, clicking the same pin again retries the search from wherever the page currently is.

### File Feature (All Attachments)
Rather than digging through announcements, assignments, and materials one by one to find a specific file, TouchGrass GCR collects every attachment across a class — PDFs, PowerPoint slides, images, documents, zip files, and more — into a single **Open All Files** tab. Each entry links both to the file itself and back to the original post it came from.

The list can be filtered by file type or searched by filename right from the page header, similar to a Ctrl+F search, with matching text highlighted as the student types. Since file collection is part of the same automatic background sync described above, it works for archived classes too, so attachments from older, no-longer-active courses stay accessible instead of disappearing along with the course.

## Troubleshooting

- **"Content script not responding" / filter does nothing**: reload the extension in `chrome://extensions`, then refresh the Classroom tab
- **Teacher list looks empty**: make sure you've visited People → View all on that class at least once
- **Filter count looks low**: scroll to the bottom of the Stream once to force-load all posts, or sync the course from the Study Planner for an exact count
- **Submission Checker gives an error about extractChecklist/checkFileNames "already declared"**: this means `background.js` accidentally has the same import written twice — check the top of the file for a duplicate `import ... from "./submissionChecker.js"` line
