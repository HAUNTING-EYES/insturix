<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  {suggestions.map((text, idx) => (
    <div
      key={`suggestion-${text.slice(0, 20).replace(/\s+/g, '-')}-${idx}`}
      className="bg-zinc-900/80 rounded-2xl shadow-lg min-h-[220px] flex items-center justify-center p-6 text-white text-xl font-semibold cursor-pointer"
      onClick={() => alert(text)}
    >
      {text}
    </div>
  ))}
</div>