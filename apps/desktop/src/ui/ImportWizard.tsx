import { useState } from 'react'

export default function ImportWizard() {
  const [files, setFiles] = useState<FileList | null>(null)
  return (
    <div className="space-y-3">
      <input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
      <button className="px-3 py-2 bg-neutral-800 rounded-md">Start Import</button>
      <pre className="text-xs bg-neutral-950 p-2 rounded-md border border-neutral-800">
        {files &&
          Array.from(files)
            .map((f) => f.name)
            .join('\n')}
      </pre>
    </div>
  )
}
