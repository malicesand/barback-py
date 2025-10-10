// // Pick a range like your Apps Script did:
// const timeMin = '2025-07-19T00:00:00-05:00';
// const timeMax = '2025-07-28T23:59:59-05:00';

// async function exportAllSelected(calendarIds: string[]) {
//   // 1) make sure login happened (call your existing googleConnectAndOpenUpload first if needed)
//   const lists = await window.gcal.listCalendars(); // show UI to pick photographers

//   // 2) export selected calendars
//   const results = await window.gcal.exportMultipleCalendarsJson({
//     calendarIds,
//     timeMin,
//     timeMax,
//   });

//   // 3) toast results
//   console.table(results);
// }

// // Or single calendar (e.g. “Sam”):
// async function exportSam(calId: string) {
//   const r = await window.gcal.exportCalendarJson({
//     calendarId: calId,
//     timeMin,
//     timeMax,
//     suggestedFilename: 'schedule_sam.json',
//   });
//   if (r.ok) {
//     console.log('Saved to', r.path);
//   }
// }
