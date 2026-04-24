'use client';

import { useMemo, useState } from 'react';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import TrustedOperatorCard, {
  type TrustedOperatorCardOperator,
} from '@/app/(public)/components/TrustedOperatorCard';

type TrustedOperatorsGridProps = {
  operators: TrustedOperatorCardOperator[];
};

const buildCardKey = (operator: TrustedOperatorCardOperator, index: number) =>
  `${operator.operator_user_id || operator.operator_email || 'operator'}-${index}`;

export default function TrustedOperatorsGrid({
  operators,
}: TrustedOperatorsGridProps) {
  const [openByKey, setOpenByKey] = useState<Record<string, boolean>>({});

  const rows = useMemo(
    () =>
      operators.map((operator, index) => ({
        operator,
        cardKey: buildCardKey(operator, index),
      })),
    [operators]
  );

  return (
    <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
      {rows.map(({ operator, cardKey }) => (
        <StaggerItem key={cardKey} className="self-start">
          <TrustedOperatorCard
            operator={operator}
            isCommentsOpen={!!openByKey[cardKey]}
            onToggleComments={() =>
              setOpenByKey((prev) => ({
                ...prev,
                [cardKey]: !prev[cardKey],
              }))
            }
          />
        </StaggerItem>
      ))}
    </Stagger>
  );
}
