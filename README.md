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
