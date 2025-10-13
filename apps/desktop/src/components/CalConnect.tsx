// upload calendar
import { useEffect, useState, useCallback } from 'react';
import { type Calendar } from '../global.d.ts';


export default function CallConnect() {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [selected, setSelected] = useState<string[]>([])
  // const [files, setFiles] = useState<string[]>([]) // everything in data/
  const [schedules, setSchedules] = useState<string[]>([]) 
  
  
  async function getCalendars() {
    setCalendars(await window.gcal.listCalendars());
  };

  const getSchedules = useCallback(async() => {
    const files = await window.data.readSchedules();
    // setFiles(files);

    const schedules = files.filter(file => file.endsWith('.json'));
    setSchedules(schedules);
    
  }, []);

  async function saveSelected(selected: string[]) {
    const timeMin = '2025-10-11T00:00:00-05:00';
    const timeMax = '2025-10-17T23:59:59-05:00';
    const calendarIds = selected;
    await window.gcal.exportMultipleCalendarsJson({calendarIds, timeMin, timeMax})
    getSchedules();
  }
  useEffect(() => {
    getCalendars();
    getSchedules()
  },  [getSchedules]);

  // useEffect(() => {
  //   getSchedules();
  // }, []);
  

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
        <ul>
          {schedules.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    );
} 
