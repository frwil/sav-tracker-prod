<?php
// src/Validator/Constraints/BuildingAvailable.php
namespace App\Validator\Constraints; // <--- Doit correspondre à l'import

use Symfony\Component\Validator\Constraint;

#[\Attribute(\Attribute::TARGET_CLASS)]
class BuildingAvailable extends Constraint
{
    public string $message = 'Le bâtiment "{{ building }}" possède déjà une bande active.';

    public function getTargets(): string
    {
        return self::CLASS_CONSTRAINT;
    }
}