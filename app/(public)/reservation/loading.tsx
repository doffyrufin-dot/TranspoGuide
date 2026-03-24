export default function ReservationLoading() {
  return (
    <main>
      <section className="pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="tg-skeleton h-7 w-40 mx-auto mb-5" />
          <div className="tg-skeleton h-12 w-3/4 mx-auto mb-4" />
          <div className="tg-skeleton h-5 w-2/3 mx-auto" />
        </div>
      </section>
      <section className="pb-28 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="card-glow p-6 rounded-2xl">
              <div className="tg-skeleton h-7 w-44 mb-4" />
              <div className="grid grid-cols-2 gap-3">
                <div className="tg-skeleton h-6 w-full" />
                <div className="tg-skeleton h-6 w-full" />
                <div className="tg-skeleton h-6 w-full" />
                <div className="tg-skeleton h-6 w-full" />
              </div>
            </div>
            <div className="card-glow p-6 rounded-2xl">
              <div className="tg-skeleton h-7 w-36 mb-5" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 15 }).map((_, idx) => (
                  <div key={idx} className="tg-skeleton h-12 w-full" />
                ))}
              </div>
            </div>
          </div>
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="card-glow p-6 md:p-8 rounded-2xl">
              <div className="tg-skeleton h-8 w-56 mb-6" />
              <div className="space-y-4">
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-32 w-full" />
              </div>
            </div>
            <div className="card-glow p-6 md:p-8 rounded-2xl">
              <div className="tg-skeleton h-8 w-52 mb-5" />
              <div className="space-y-3 mb-6">
                <div className="tg-skeleton h-5 w-full" />
                <div className="tg-skeleton h-5 w-full" />
                <div className="tg-skeleton h-5 w-full" />
              </div>
              <div className="tg-skeleton h-12 w-full" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

