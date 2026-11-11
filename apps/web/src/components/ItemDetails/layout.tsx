import { useDetailsVariant } from "./detailsVariant";

export function ItemDetailsLayout({
  title,
  properties,
  checklist,
  description,
  actions,
  children,
}: {
  title: React.ReactNode;
  properties: React.ReactNode;
  checklist?: React.ReactNode;
  description: React.ReactNode;
  actions: React.ReactNode;
  children?: React.ReactNode;
}) {
  const variant = useDetailsVariant();

  if (variant === "panel") {
    return (
      <div className="px-3 py-3 space-y-3">
        {title}
        <div className="space-y-2 text-xs">
          {properties}
          {checklist}
          <div className="pt-1">{description}</div>
        </div>
        {actions}
        {children}
      </div>
    );
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[auto_1fr]">
      <div className="px-5 pt-8 sm:px-10 lg:col-start-1 lg:row-start-1 lg:pt-12">
        <div className="mx-auto w-full max-w-3xl">{title}</div>
      </div>
      <aside className="border-y border-task-panel-divider px-5 py-5 sm:px-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-y-0 lg:border-l lg:px-5 lg:py-6 mt-6 lg:mt-0">
        <h2 className="mb-2 text-xs font-medium text-content-tinted">
          Properties
        </h2>
        <div className="space-y-0.5 text-[13px]">{properties}</div>
        <div className="mt-6 space-y-1.5">{actions}</div>
      </aside>
      <div className="px-5 pb-16 pt-6 sm:px-10 lg:col-start-1 lg:row-start-2">
        <div className="mx-auto w-full max-w-3xl space-y-8">
          {description}
          {checklist && (
            <section>
              <h2 className="mb-2 text-xs font-medium text-content-tinted">
                Checklist
              </h2>
              <div className="text-sm">{checklist}</div>
            </section>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

const actionClass = {
  panel:
    "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-content-tinted border border-border hover:bg-task-panel-hover hover:text-content transition-colors cursor-pointer",
  page: "w-full flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 text-[13px] text-content-tinted hover:bg-task-panel-hover hover:text-content transition-colors cursor-pointer [&_svg]:h-3.5 [&_svg]:w-3.5",
};

export function DetailsAction({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const variant = useDetailsVariant();
  return (
    <button type="button" onClick={onClick} className={actionClass[variant]}>
      {icon}
      {children}
    </button>
  );
}
