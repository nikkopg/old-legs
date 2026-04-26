const BLOCK = 'bg-[rgba(20,18,16,0.08)] rounded animate-pulse'

export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[#1a1612] flex justify-center items-start py-10 px-5">
      <div className="bg-[#f4efe4] w-[980px] max-w-full px-9 pt-7 pb-10">

        {/* Top rail */}
        <div className={`h-2.5 w-full mb-4 ${BLOCK}`} />

        {/* Masthead */}
        <div className={`h-20 w-2/3 mx-auto mb-4 ${BLOCK}`} />

        {/* Rule */}
        <div className={`h-1 w-full mb-6 ${BLOCK}`} />

        {/* Lead row */}
        <div className="grid grid-cols-[1.4fr_1fr] gap-7 mb-6">
          <div className="space-y-3">
            <div className={`h-2.5 w-1/3 ${BLOCK}`} />
            <div className={`h-14 w-full ${BLOCK}`} />
            <div className={`h-3 w-2/3 ${BLOCK}`} />
            <div className={`h-3 w-1/2 ${BLOCK}`} />
          </div>
          <div className={`h-40 ${BLOCK}`} />
        </div>

        {/* Rule */}
        <div className={`h-px w-full mb-5 ${BLOCK}`} />

        {/* Content rows + sidebar */}
        <div className="flex gap-7">
          <div className="flex-1 space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-14 w-full ${BLOCK}`} />
            ))}
          </div>
          <div className="w-[240px] shrink-0 space-y-3">
            <div className={`h-3 w-1/2 ${BLOCK}`} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-8 w-full ${BLOCK}`} />
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
