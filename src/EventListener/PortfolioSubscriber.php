<?php

namespace App\EventListener;

use App\Entity\Customer;
use App\Entity\PortfolioHistory;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\OnFlushEventArgs;

#[AsDoctrineListener(event: Events::onFlush)]
class PortfolioSubscriber
{
    public function onFlush(OnFlushEventArgs $args): void
    {
        $em = $args->getObjectManager();
        $uow = $em->getUnitOfWork();

        foreach ($uow->getScheduledEntityUpdates() as $entity) {
            if ($entity instanceof Customer) {
                $changes = $uow->getEntityChangeSet($entity);

                // Si l'affectation a changé
                if (isset($changes['affectedTo'])) {
                    $oldTech = $changes['affectedTo'][0]; // Ancien Tech
                    $newTech = $changes['affectedTo'][1]; // Nouveau Tech

                    // 1. Clôturer l'ancien historique (Si existant)
                    if ($oldTech) {
                        // On cherche l'entrée active (celle qui n'a pas de date de fin)
                        $historyRepo = $em->getRepository(PortfolioHistory::class);
                        $activeEntry = $historyRepo->findOneBy([
                            'customer' => $entity,
                            'technician' => $oldTech,
                            'endDate' => null
                        ]);

                        if ($activeEntry) {
                            $activeEntry->close();
                            $uow->computeChangeSet($em->getClassMetadata(PortfolioHistory::class), $activeEntry);
                        }
                    }

                    // 2. Créer le nouvel historique
                    if ($newTech) {
                        $newEntry = new PortfolioHistory($newTech, $entity);
                        $em->persist($newEntry);
                        $uow->computeChangeSet($em->getClassMetadata(PortfolioHistory::class), $newEntry);
                    }
                }
            }
        }

        // Gestion de la création (New Customer)
        foreach ($uow->getScheduledEntityInsertions() as $entity) {
            if ($entity instanceof Customer && $entity->getAffectedTo()) {
                $newEntry = new PortfolioHistory($entity->getAffectedTo(), $entity);
                $em->persist($newEntry);
                $uow->computeChangeSet($em->getClassMetadata(PortfolioHistory::class), $newEntry);
            }
        }
    }
}