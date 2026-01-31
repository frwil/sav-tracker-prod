<?php

namespace App\Validator\Constraints;

use App\Entity\Observation;
use Symfony\Bundle\SecurityBundle\Security; 
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class ConsistentObservationDateValidator extends ConstraintValidator
{
    // 👇 Injection de dépendance
    public function __construct(private Security $security)
    {
    }

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$value instanceof Observation) {
            throw new UnexpectedTypeException($value, Observation::class);
        }

        // 1. EXEMPTION ADMIN : Si c'est un admin, on valide tout d'office.
        if ($this->security->isGranted('ROLE_ADMIN')) {
            return;
        }

        /** @var Observation $observation */
        $observation = $value;
        $visit = $observation->getVisit();
        $observedAt = $observation->getObservedAt();

        if (!$visit || !$observedAt) {
            return;
        }

        $visitedAt = $visit->getVisitedAt();
        if (!$visitedAt) {
            return;
        }

        // Utilisation de createFromInterface pour gérer DateTime et DateTimeImmutable
        $visitStart = \DateTime::createFromInterface($visitedAt);
        $visitStart->modify('-1 hour');

        $visitEnd = \DateTime::createFromInterface($visitedAt);
        $visitEnd->modify('+1 day +1 hour'); 

        // Vérification stricte pour les non-admins
        if ($observedAt < $visitStart || $observedAt > $visitEnd) {
            $this->context->buildViolation($constraint->message)
                ->atPath('observedAt')
                ->setParameter('{{ visit_date }}', $visitedAt->format('d/m/Y'))
                ->addViolation();
        }
    }
}