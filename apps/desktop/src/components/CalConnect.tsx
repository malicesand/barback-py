// upload calendar
import { useEffect, useState, useCallback } from 'react';
import { type Calendar } from '../global.d.ts';


export default function CallConnect() {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [schedules, setSchedules] = useState<string[]>([]) 
  
  
  async function getCalendars() {
    setCalendars(await window.gcal.listCalendars());
  };

  const getSchedules = useCallback(async() => {
    const files = await window.data.readSchedules();
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

   return (
      <div style={{ padding: 16, fontFamily: 'system-ui' }}>
        <h1>smallestHog69</h1>
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
          <button onClick={() => saveSelected(selected)}> Download </button>
        </div>
        <div style={{ border: '1px solid #999', borderRadius: 8, padding: 12 }}> 
          <h3>Downloaded Calendars</h3>
            <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
            {schedules.map((s, i) => (
              <span key={i}>{s}</span>
            ))}            
          </div>
        </div>
      </div>
    );
} 

/** Backlog
 * Time / Date downloaded
 */