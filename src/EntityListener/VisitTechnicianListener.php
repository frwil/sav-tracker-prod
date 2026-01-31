<?php

namespace App\EntityListener;

use App\Entity\Visit;
use App\Entity\User;
use Symfony\Bundle\SecurityBundle\Security;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsEntityListener;
use Doctrine\ORM\Events;
use Doctrine\ORM\Event\PrePersistEventArgs;

#[AsEntityListener(event: Events::prePersist, method: 'prePersist', entity: Visit::class)]
class VisitTechnicianListener
{
    public function __construct(private Security $security)
    {
    }

    public function prePersist(Visit $visit, PrePersistEventArgs $event): void
    {
        $user = $this->security->getUser();

        // 1. Assignation automatique du technicien à la visite (votre logique existante)
        if ($user instanceof User && !$visit->getTechnician()) {
            $visit->setTechnician($user);
        }

        // 👇 2. LOGIQUE INTELLIGENTE : Affectation du Client au Technicien
        $customer = $visit->getCustomer();
        $technician = $visit->getTechnician();

        if ($customer && $technician) {
            // Si le client n'est affecté à personne, le technicien le "récupère"
            if ($customer->getAffectedTo() === null) {
                $customer->setAffectedTo($technician);
                
                // Important : On s'assure que Doctrine sauve aussi le changement du client
                // Note : Dans un PrePersist, les changements sur les associations liées 
                // nécessitent parfois un appel explicite ou sont gérés par la cascade.
            }
        }
    }
}