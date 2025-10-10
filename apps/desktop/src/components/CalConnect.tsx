// upload calendar
import { useEffect, useState } from 'react';
import { type Calendar } from '../global.d.ts'

export default function CallConnect() {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [selected, setSelected] = useState<string[]>([])

  async function getCalendars() {
    setCalendars(await window.gcal.listCalendars());
  }

  // function showSelected() {
  //   console.log(selected)
  // }

  async function saveSelected(selected: string[]) {
    const timeMin = '2025-10-11T00:00:00-05:00';
    const timeMax = '2025-10-17T23:59:59-05:00';
    const calendarIds = selected;
    await window.gcal.exportMultipleCalendarsJson({calendarIds, timeMin, timeMax})
  }
  useEffect(() => {
    getCalendars();
  }, []);
  

   return (
      <div style={{ padding: 16, fontFamily: 'system-ui' }}>
        <h1>Big Hog</h1>
        <div>
          {calendars.map(c => {
            const checked = selected.includes(c.id)
            return(
            <div key={c.id}>
              <input 
                type="checkbox"
                onChange={() => setSelected(checked ? selected.filter(x => x !== c.id) : [...selected, c.id])}
              />
              {c.summary}
            </div>
          )})}

          <button onClick={() => saveSelected(selected)}> Upload </button>
        </div>
      </div>
    );
} 
