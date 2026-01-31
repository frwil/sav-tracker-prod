<?php

namespace App\EntityListener;

use App\Entity\Flock;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;
use Doctrine\ORM\Events;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

#[AsEntityListener(event: Events::preRemove, method: 'preRemove', entity: Flock::class)]
class FlockDeletionListener
{
    public function preRemove(Flock $flock): void
    {
        // 1. Empêcher la suppression si des observations existent
        if (!$flock->getObservations()->isEmpty()) {
            throw new UnprocessableEntityHttpException(
                sprintf('Impossible de supprimer la bande "%s" car elle contient %d observations. Vous devez d\'abord supprimer les observations ou archiver la bande.', $flock->getName(), $flock->getObservations()->count())
            );
        }

        // 2. Empêcher la suppression si le bâtiment est archivé (fermé)
        // (Sauf si vous voulez permettre le nettoyage des vieux bâtiments, mais selon votre règle :)
        if ($flock->getBuilding() && !$flock->getBuilding()->isActivated()) {
            throw new UnprocessableEntityHttpException(
                sprintf('Impossible de supprimer la bande "%s" car son bâtiment "%s" est archivé. Veuillez réactiver le bâtiment d\'abord.', $flock->getName(), $flock->getBuilding()->getName())
            );
        }
    }
}