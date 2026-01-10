export default function ExportPage(){
  return (
    <div className='space-y-3'>
      <p>Select spells or a character’s spellbook and export to Markdown or PDF.</p>
      <div className='flex gap-2'>
        <button className='px-3 py-2 bg-neutral-800 rounded-md'>Export Markdown</button>
        <button className='px-3 py-2 bg-neutral-800 rounded-md'>Export PDF</button>
      </div>
    </div>
  )
}
