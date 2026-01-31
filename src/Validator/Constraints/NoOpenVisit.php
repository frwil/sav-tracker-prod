<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

#[\Attribute]
class NoOpenVisit extends Constraint
{
    public string $message = 'Une visite est déjà en cours pour ce client (ID: {{ visit_id }}). Veuillez la clôturer avant d\'en créer une nouvelle.';

    public function getTargets(): string|array
    {
        return self::CLASS_CONSTRAINT;
    }
}