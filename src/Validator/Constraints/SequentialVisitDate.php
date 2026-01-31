<?php

namespace App\Validator\Constraints;

use Symfony\Component\Validator\Constraint;

#[\Attribute]
class SequentialVisitDate extends Constraint
{
    public string $message = 'La date de cette visite ("{{ date }}") ne peut pas être antérieure à la dernière visite du {{ last_date }}.';

    public function getTargets(): string
    {
        return self::CLASS_CONSTRAINT;
    }
}