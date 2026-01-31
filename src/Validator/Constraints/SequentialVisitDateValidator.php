<?php

namespace App\Validator\Constraints;

use App\Entity\Visit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\SecurityBundle\Security; // 👇 Import important
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class SequentialVisitDateValidator extends ConstraintValidator
{
    // 👇 On injecte le service de Sécurité
    public function __construct(
        private EntityManagerInterface $em,
        private Security $security
    ) {
    }

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$value instanceof Visit) {
            throw new UnexpectedTypeException($value, Visit::class);
        }

        // 1. SI C'EST UN ADMIN, ON AUTORISE TOUT (Pas de validation)
        if ($this->security->isGranted('ROLE_ADMIN')) {
            return;
        }

        /** @var Visit $newVisit */
        $newVisit = $value;
        $customer = $newVisit->getCustomer();
        $newDate = $newVisit->getVisitedAt();

        if (!$customer || !$newDate) {
            return;
        }

        // ... (Le reste du code reste inchangé : recherche de la dernière visite et comparaison)
        $qb = $this->em->getRepository(Visit::class)->createQueryBuilder('v');
        $qb->select('v')
           ->where('v.customer = :customer')
           ->andWhere('v.id != :currentId')
           ->setParameter('customer', $customer)
           ->setParameter('currentId', $newVisit->getId() ?? 0)
           ->orderBy('v.visitedAt', 'DESC')
           ->setMaxResults(1);

        $lastVisit = $qb->getQuery()->getOneOrNullResult();

        if ($lastVisit) {
            $lastDate = $lastVisit->getVisitedAt();
            if ($newDate < $lastDate) {
                $this->context->buildViolation($constraint->message)
                    ->atPath('visitedAt')
                    ->setParameter('{{ date }}', $newDate->format('d/m/Y'))
                    ->setParameter('{{ last_date }}', $lastDate->format('d/m/Y'))
                    ->addViolation();
            }
        }
    }
}