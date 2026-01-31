<?php

namespace App\Validator\Constraints;

use App\Entity\Visit;
use App\Repository\VisitRepository;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class NoOpenVisitValidator extends ConstraintValidator
{
    public function __construct(private VisitRepository $visitRepository) {}

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof NoOpenVisit) {
            throw new UnexpectedTypeException($constraint, NoOpenVisit::class);
        }

        if (!$value instanceof Visit) {
            return;
        }

        // Si la visite est déjà fermée ou archivée à la création, on s'en fiche
        if ($value->isClosed() || !$value->isActivated()) {
            return;
        }

        $customer = $value->getCustomer();
        if (!$customer) {
            return;
        }

        // On cherche s'il existe DÉJÀ une visite ouverte pour ce client
        $existingVisit = $this->visitRepository->findOneBy([
            'customer' => $customer,
            'closed' => false,
            'activated' => true
        ]);

        // Si on en trouve une, et que ce n'est pas la visite qu'on est en train de modifier
        if ($existingVisit && $existingVisit->getId() !== $value->getId()) {
            $this->context->buildViolation($constraint->message)
                ->setParameter('{{ visit_id }}', (string) $existingVisit->getId())
                ->addViolation();
        }
    }
}