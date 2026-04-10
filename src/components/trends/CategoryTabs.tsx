'use client';

const FIXED_CATEGORIES = [
  'All',
  'Machine Learning',
  'Natural Language Processing',
  'Computer Vision',
  'Reinforcement Learning',
];

interface Props {
  categories: string[];
  selected:   string;
  onSelect:   (cat: string) => void;
}

export function CategoryTabs({ categories, selected, onSelect }: Props) {
  const allCats = [...new Set([...FIXED_CATEGORIES, ...categories])];

  return (
    <div className="flex flex-wrap gap-2">
      {allCats.map(cat => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-3 py-1 text-sm rounded-full transition-colors ${
            selected === cat
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
