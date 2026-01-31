<?php

namespace App\Controller;

use App\Entity\Flock;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpKernel\Attribute\AsController;

#[AsController]
class CloseFlockController extends AbstractController
{
    public function __invoke(Flock $flock, EntityManagerInterface $entityManager): Flock
    {
        // Si la bande est déjà fermée, on ne fait rien (idempotence)
        if ($flock->isClosed()) {
            return $flock;
        }

        // Application de la logique métier
        $flock->setClosed(true);
        $flock->setEndDate(new \DateTime()); // Capture la date/heure exacte de l'action

        // Sauvegarde en base
        $entityManager->flush();

        return $flock;
    }
}