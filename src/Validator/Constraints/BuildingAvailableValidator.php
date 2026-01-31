<?php

namespace App\Validator\Constraints;

use App\Entity\Flock;
use App\Repository\FlockRepository;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class BuildingAvailableValidator extends ConstraintValidator
{
    public function __construct(private FlockRepository $flockRepository)
    {
    }

    public function validate(mixed $value, Constraint $constraint): void
    {
        if (!$constraint instanceof BuildingAvailable) {
            throw new UnexpectedTypeException($constraint, BuildingAvailable::class);
        }

        // Cette contrainte s'applique à la classe Flock entière
        if (!$value instanceof Flock) {
            return;
        }

        $building = $value->getBuilding();

        // Si pas de bâtiment, on laisse passer (d'autres validateurs gèreront le NotNull)
        if (null === $building) {
            return;
        }

        // Si la bande qu'on crée est déjà fermée (archivage), pas de conflit
        if ($value->isClosed()) {
            return;
        }

        // Recherche de bandes actives existantes pour ce bâtiment
        // On cherche une bande liée à ce bâtiment qui n'est PAS fermée (closed = false)
        $activeFlocks = $this->flockRepository->findBy([
            'building' => $building,
            'closed' => false
        ]);

        foreach ($activeFlocks as $activeFlock) {
            // Si on est en train de modifier la bande elle-même, on l'ignore
            if ($activeFlock->getId() === $value->getId()) {
                continue;
            }

            // Si on trouve une AUTRE bande active, c'est une erreur
            $this->context->buildViolation($constraint->message)
                ->setParameter('{{ building }}', $building->getName())
                ->atPath('building') // L'erreur s'affichera sur le champ 'building'
                ->addViolation();
            
            // Une seule erreur suffit
            break;
        }
    }
}