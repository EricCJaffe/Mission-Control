import ClassSessionForm from '@/components/fitness/ClassSessionForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Log a class | Fitness' };

export default function LogClassPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-1">
      <div>
        <h1 className="text-3xl font-semibold">Log a class</h1>
        <p className="mt-1 text-sm text-slate-500">
          Time and effort are what count toward training balance. Everything else is
          there so the session is worth reading back later.
        </p>
      </div>
      <ClassSessionForm />
    </div>
  );
}
