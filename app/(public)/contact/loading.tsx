export default function ContactLoading() {
  return (
    <main>
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="tg-skeleton h-7 w-36 mx-auto mb-6" />
          <div className="tg-skeleton h-12 w-3/4 mx-auto mb-5" />
          <div className="tg-skeleton h-5 w-2/3 mx-auto" />
        </div>
      </section>
      <section className="py-16 px-6 pb-28">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-24 w-full" />
            <div className="tg-skeleton h-40 w-full" />
          </div>
          <div className="lg:col-span-3">
            <div className="card-glow p-8 rounded-2xl">
              <div className="tg-skeleton h-8 w-52 mb-7" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-12 w-full" />
              </div>
              <div className="space-y-5">
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-12 w-full" />
                <div className="tg-skeleton h-28 w-full" />
                <div className="tg-skeleton h-12 w-full" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

